import os
from io import StringIO
from unittest.mock import patch

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.core.management.base import CommandError
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse

from .api_token_cache import preload_active_api_tokens
from .models import (
    Client,
    Dialer,
    DialerRoutingPolicy,
    RESTAPITOKENS,
    RoutingBatch,
    RoutingEndpoint,
    RoutingFlow,
    RoutingProject,
)
from .route_cache import preload_dialer_route_map
from .routing import (
    get_routing_policy_config,
    select_weighted_call_assignment,
    select_weighted_route,
)
from .views import MFA_SESSION_KEY, _generate_totp_code


class BootstrapSuperuserCommandTests(TestCase):
    def test_creates_configured_superuser_once(self):
        environment = {
            "DJANGO_SUPERUSER_USERNAME": "admin",
            "DJANGO_SUPERUSER_PASSWORD": "initial-test-password",
            "DJANGO_SUPERUSER_EMAIL": "admin@example.com",
        }

        with patch.dict(os.environ, environment, clear=False):
            call_command("bootstrap_superuser", stdout=StringIO())

        user = get_user_model().objects.get(username="admin")
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_staff)
        self.assertEqual(user.email, "admin@example.com")
        self.assertTrue(user.check_password("initial-test-password"))

        with patch.dict(os.environ, environment, clear=False):
            call_command("bootstrap_superuser", stdout=StringIO())

        self.assertEqual(get_user_model().objects.filter(username="admin").count(), 1)

    def test_does_not_overwrite_an_existing_superuser_password(self):
        user = get_user_model().objects.create_superuser(
            username="admin",
            password="existing-password",
        )

        with patch.dict(
            os.environ,
            {
                "DJANGO_SUPERUSER_USERNAME": "admin",
                "DJANGO_SUPERUSER_PASSWORD": "replacement-password",
            },
            clear=False,
        ):
            call_command("bootstrap_superuser", stdout=StringIO())

        user.refresh_from_db()
        self.assertTrue(user.check_password("existing-password"))
        self.assertFalse(user.check_password("replacement-password"))

    def test_refuses_to_elevate_an_existing_regular_user(self):
        get_user_model().objects.create_user(
            username="admin",
            password="regular-password",
        )

        with patch.dict(
            os.environ,
            {
                "DJANGO_SUPERUSER_USERNAME": "admin",
                "DJANGO_SUPERUSER_PASSWORD": "replacement-password",
            },
            clear=False,
        ):
            with self.assertRaises(CommandError):
                call_command("bootstrap_superuser", stdout=StringIO())


class DialerCredentialsViewTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(
            username="dialer-owner",
            password="test-password",
        )
        client = Client.objects.create(user=user, client_name="Test Client")
        self.api_token = RESTAPITOKENS.objects.create(token="active-test-token")

        Dialer.objects.create(
            dialer_name="Zulu Dialer",
            client=client,
            project="Project Z",
            xferexten="100",
            api_user="zulu-user",
            api_password="zulu-password",
            agent_api_url="https://agent.example.com/api/",
            non_agent_api_url="https://non-agent.example.com/api/",
            agent_count=1,
            batch="1",
            route_ip="127.0.0.1",
            flow="A",
            active=False,
        )
        Dialer.objects.create(
            dialer_name="Alpha Dialer",
            client=client,
            project="Project A",
            xferexten="101",
            api_user=None,
            api_password=None,
            agent_count=1,
            batch="2",
            route_ip="127.0.0.2",
            flow="B",
        )
        preload_active_api_tokens()

    def test_requires_an_active_api_token(self):
        response = self.client.get(reverse("dialer_credentials"))

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "Invalid API token.")

    def test_returns_all_dialer_credentials_and_disables_caching(self):
        response = self.client.get(
            reverse("dialer_credentials"),
            HTTP_AUTHORIZATION=f"Bearer {self.api_token.token}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(response["Pragma"], "no-cache")
        self.assertEqual(
            response.json(),
            {
                "status_code": 200,
                "dialer_count": 2,
                "dialers": [
                    {
                        "dialer_name": "Alpha Dialer",
                        "api_user": None,
                        "api_password": None,
                        "agent_api_url": None,
                        "non_agent_api_url": None,
                    },
                    {
                        "dialer_name": "Zulu Dialer",
                        "api_user": "zulu-user",
                        "api_password": "zulu-password",
                        "agent_api_url": "https://agent.example.com/api/",
                        "non_agent_api_url": "https://non-agent.example.com/api/",
                    },
                ],
            },
        )


class HealthViewTests(TestCase):
    def test_reports_database_and_cache_readiness(self):
        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status_code": 200, "status": "ok"})


class AuthenticationFlowTests(TestCase):
    password = "Current-S3cure-Passphrase!"
    replacement_password = "Replacement-S3cure-Passphrase!"
    fixed_time = 1_800_000_000
    totp_secret = "JBSWY3DPEHPK3PXP"

    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user(
            username="portal-user",
            email="user@example.com",
            password=self.password,
        )
        self.client_profile = Client.objects.create(
            user=self.user,
            client_name="Portal Client",
        )

    def _totp_code(self):
        return _generate_totp_code(self.totp_secret, self.fixed_time // 30)

    def _enable_mfa(self):
        self.client_profile.recovery_totp_secret = self.totp_secret
        self.client_profile.recovery_totp_enabled = True
        self.client_profile.save(
            update_fields=["recovery_totp_secret", "recovery_totp_enabled"]
        )

    def _start_mfa_login(self, client=None):
        test_client = client or self.client
        return test_client.post(
            reverse("login"),
            data={"email": self.user.email, "password": self.password},
            content_type="application/json",
        )

    def test_login_options_does_not_disclose_account_state(self):
        existing_response = self.client.post(
            reverse("login_options"),
            data={"email": self.user.email},
            content_type="application/json",
        )
        missing_response = self.client.post(
            reverse("login_options"),
            data={"email": "missing@example.com"},
            content_type="application/json",
        )

        self.assertEqual(existing_response.status_code, 200)
        self.assertEqual(missing_response.status_code, 200)
        self.assertEqual(existing_response.json(), missing_response.json())
        self.assertFalse(existing_response.json()["authenticator_enabled"])

    def test_password_login_still_works_without_mfa(self):
        response = self._start_mfa_login()

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["mfa_required"])
        self.assertEqual(response.json()["login_method"], "password")
        self.assertEqual(int(self.client.session["_auth_user_id"]), self.user.pk)

    def test_repeated_password_failures_are_throttled(self):
        for _ in range(5):
            response = self.client.post(
                reverse("login"),
                data={"email": self.user.email, "password": "incorrect-password"},
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 401)

        locked_response = self.client.post(
            reverse("login"),
            data={"email": self.user.email, "password": self.password},
            content_type="application/json",
        )

        self.assertEqual(locked_response.status_code, 429)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_mfa_user_is_not_authenticated_after_password_only(self):
        self._enable_mfa()

        with patch("Chatbot.views.time.time", return_value=self.fixed_time):
            response = self._start_mfa_login()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["mfa_required"])
        self.assertNotIn("_auth_user_id", self.client.session)
        self.assertEqual(
            self.client.session[MFA_SESSION_KEY]["user_id"],
            self.user.pk,
        )

    def test_otp_cannot_be_used_without_a_password_challenge(self):
        self._enable_mfa()

        with patch("Chatbot.views.time.time", return_value=self.fixed_time):
            response = self.client.post(
                reverse("login"),
                data={"otp": self._totp_code()},
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 401)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_password_then_mfa_authenticates_and_rejects_otp_replay(self):
        self._enable_mfa()
        second_client = self.client_class()

        with patch("Chatbot.views.time.time", return_value=self.fixed_time):
            challenge_response = self._start_mfa_login()
            login_response = self.client.post(
                reverse("login"),
                data={"otp": self._totp_code()},
                content_type="application/json",
            )
            second_challenge_response = self._start_mfa_login(second_client)
            replay_response = second_client.post(
                reverse("login"),
                data={"otp": self._totp_code()},
                content_type="application/json",
            )

        self.assertTrue(challenge_response.json()["mfa_required"])
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.json()["login_method"], "password_mfa")
        self.assertEqual(int(self.client.session["_auth_user_id"]), self.user.pk)
        self.assertTrue(second_challenge_response.json()["mfa_required"])
        self.assertEqual(replay_response.status_code, 401)
        self.assertNotIn("_auth_user_id", second_client.session)

    def test_expired_mfa_challenge_is_rejected(self):
        self._enable_mfa()

        with patch("Chatbot.views.time.time", return_value=self.fixed_time):
            self._start_mfa_login()

        session = self.client.session
        session[MFA_SESSION_KEY]["expires_at"] = self.fixed_time - 1
        session.save()

        with patch("Chatbot.views.time.time", return_value=self.fixed_time):
            response = self.client.post(
                reverse("login"),
                data={"otp": self._totp_code()},
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 401)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_recovery_start_is_generic_for_existing_and_missing_accounts(self):
        self._enable_mfa()

        existing_response = self.client.post(
            reverse("forgot_password_start"),
            data={"email": self.user.email},
            content_type="application/json",
        )
        missing_response = self.client.post(
            reverse("forgot_password_start"),
            data={"email": "missing@example.com"},
            content_type="application/json",
        )

        self.assertEqual(existing_response.status_code, 200)
        self.assertEqual(missing_response.status_code, 200)
        self.assertEqual(existing_response.json(), missing_response.json())

    def test_recovery_token_is_single_use(self):
        self._enable_mfa()

        with patch("Chatbot.views.time.time", return_value=self.fixed_time):
            verify_response = self.client.post(
                reverse("forgot_password_verify"),
                data={"email": self.user.email, "otp": self._totp_code()},
                content_type="application/json",
            )

        reset_token = verify_response.json()["reset_token"]
        reset_payload = {
            "reset_token": reset_token,
            "new_password": self.replacement_password,
            "confirm_password": self.replacement_password,
        }
        reset_response = self.client.post(
            reverse("forgot_password_reset"),
            data=reset_payload,
            content_type="application/json",
        )
        replay_response = self.client.post(
            reverse("forgot_password_reset"),
            data=reset_payload,
            content_type="application/json",
        )

        self.assertEqual(verify_response.status_code, 200)
        self.assertEqual(reset_response.status_code, 200)
        self.assertEqual(replay_response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.replacement_password))

    def test_enabling_mfa_requires_current_password(self):
        self.client.force_login(self.user)

        missing_password_response = self.client.post(
            reverse("account_authenticator_setup"),
            data={},
            content_type="application/json",
        )
        valid_response = self.client.post(
            reverse("account_authenticator_setup"),
            data={"current_password": self.password},
            content_type="application/json",
        )

        self.assertEqual(missing_password_response.status_code, 400)
        self.assertEqual(valid_response.status_code, 200)
        self.assertIn("otpauth_url", valid_response.json())


class WeightedRoutingTests(TestCase):
    def setUp(self):
        cache.clear()
        user = get_user_model().objects.create_user(
            username="routing-owner",
            password="test-password",
        )
        client = Client.objects.create(user=user, client_name="Routing Client")
        self.api_token = RESTAPITOKENS.objects.create(token="routing-test-token")
        self.dialer = Dialer.objects.create(
            dialer_name="Weighted Dialer",
            client=client,
            project="Legacy Project",
            xferexten="200",
            api_user="api-user",
            api_password="api-password",
            agent_api_url="https://agent.example.com/api/",
            non_agent_api_url="https://non-agent.example.com/api/",
            agent_count=1,
            batch="7,8",
            route_ip="192.0.2.1",
            flow="Legacy Flow",
        )
        self.project = RoutingProject.objects.create(
            client=client,
            name="Weighted Project",
        )
        self.flow_a = RoutingFlow.objects.create(
            project=self.project,
            name="A",
            weight=60,
        )
        self.flow_b = RoutingFlow.objects.create(
            project=self.project,
            name="B",
            weight=40,
        )
        RoutingBatch.objects.create(flow=self.flow_a, value=1, weight=50)
        RoutingBatch.objects.create(flow=self.flow_a, value=2, weight=50)
        RoutingBatch.objects.create(flow=self.flow_b, value=3, weight=100)
        self.policy = DialerRoutingPolicy.objects.create(
            dialer=self.dialer,
            project=self.project,
            enabled=True,
        )
        RoutingEndpoint.objects.create(
            policy=self.policy,
            route_ip="198.51.100.10",
            weight=60,
        )
        RoutingEndpoint.objects.create(
            policy=self.policy,
            route_ip="198.51.100.20",
            weight=40,
        )
        preload_active_api_tokens()
        preload_dialer_route_map()
        cache.clear()

    def _auth_headers(self):
        return {"HTTP_AUTHORIZATION": f"Bearer {self.api_token.token}"}

    @patch("Chatbot.routing.secrets.randbelow", side_effect=[0, 50])
    def test_selects_a_weighted_flow_and_batch(self, _mock_randbelow):
        assignment = select_weighted_call_assignment(self.dialer.id)

        self.assertEqual(
            assignment,
            {"project": "Weighted Project", "flow": "A", "batch": 2},
        )

    @patch("Chatbot.routing.secrets.randbelow", side_effect=[60, 0])
    def test_weight_boundary_selects_the_next_flow(self, _mock_randbelow):
        assignment = select_weighted_call_assignment(self.dialer.id)

        self.assertEqual(assignment["flow"], "B")
        self.assertEqual(assignment["batch"], 3)

    @patch("Chatbot.routing.secrets.randbelow", return_value=60)
    def test_selects_a_weighted_route_and_project(self, _mock_randbelow):
        route = select_weighted_route(self.dialer.id)

        self.assertEqual(
            route,
            {"project": "Weighted Project", "route_ip": "198.51.100.20"},
        )

    @patch("Chatbot.routing.secrets.randbelow", side_effect=[60, 0])
    def test_check_batch_and_flow_keeps_response_contract(self, _mock_randbelow):
        response = self.client.post(
            reverse("check_batchnflow"),
            data={"dialer_name": self.dialer.dialer_name},
            content_type="application/json",
            **self._auth_headers(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["dialer_name"], self.dialer.dialer_name)
        self.assertEqual(response.json()["flow"], "B")
        self.assertEqual(response.json()["batch"], "3")

    @patch("Chatbot.routing.secrets.randbelow", side_effect=[60, 0])
    def test_create_call_log_uses_weighted_assignment_without_contract_changes(
        self,
        _mock_randbelow,
    ):
        response = self.client.post(
            reverse("create_call_log"),
            data={
                "dialer_name": self.dialer.dialer_name,
                "call_id": 2125550100,
                "status": "live",
                "duration": 0,
            },
            content_type="application/json",
            **self._auth_headers(),
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["call_log"]["flow"], "B")
        self.assertEqual(response.json()["call_log"]["batch"], 3)

    @patch("Chatbot.routing.secrets.randbelow", return_value=60)
    def test_request_route_keeps_response_contract(self, _mock_randbelow):
        response = self.client.post(
            reverse("request_route"),
            data={"dialer_name": self.dialer.dialer_name},
            content_type="application/json",
            **self._auth_headers(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status_code": 200,
                "message": "Route IP fetched successfully.",
                "dialer_name": self.dialer.dialer_name,
                "project": "Weighted Project",
                "xferexten": "200",
                "agent_api_url": "https://agent.example.com/api/",
                "non_agent_api_url": "https://non-agent.example.com/api/",
                "api_user": "api-user",
                "api_password": "api-password",
                "route_ip": "198.51.100.20",
            },
        )

    def test_disabled_policy_uses_legacy_values(self):
        self.policy.enabled = False
        self.policy.save(update_fields=["enabled"])
        cache.clear()

        assignment_response = self.client.post(
            reverse("check_batchnflow"),
            data={"dialer_name": self.dialer.dialer_name},
            content_type="application/json",
            **self._auth_headers(),
        )
        route_response = self.client.post(
            reverse("request_route"),
            data={"dialer_name": self.dialer.dialer_name},
            content_type="application/json",
            **self._auth_headers(),
        )

        self.assertEqual(assignment_response.json()["flow"], "Legacy Flow")
        self.assertEqual(assignment_response.json()["batch"], "7,8")
        self.assertEqual(route_response.json()["project"], "Legacy Project")
        self.assertEqual(route_response.json()["route_ip"], "192.0.2.1")

    def test_flow_without_batches_falls_back_instead_of_raising(self):
        RoutingBatch.objects.filter(flow=self.flow_b).delete()
        cache.clear()

        self.assertIsNone(select_weighted_call_assignment(self.dialer.id))

    def test_incomplete_project_cannot_be_enabled_through_validation(self):
        empty_project = RoutingProject.objects.create(
            client=self.dialer.client,
            name="Empty Project",
        )
        self.policy.project = empty_project

        with self.assertRaisesMessage(
            ValidationError,
            "Add at least one active flow before enabling this policy.",
        ):
            self.policy.full_clean()

    def test_project_from_another_client_is_rejected_and_falls_back(self):
        other_user = get_user_model().objects.create_user(username="other-owner")
        other_client = Client.objects.create(user=other_user, client_name="Other Client")
        other_project = RoutingProject.objects.create(
            client=other_client,
            name="Weighted Project",
        )
        self.policy.project = other_project

        with self.assertRaisesMessage(
            ValidationError,
            "The routing project and dialer must belong to the same client.",
        ):
            self.policy.full_clean()

        self.policy.save(update_fields=["project"])
        cache.clear()
        self.assertIsNone(select_weighted_call_assignment(self.dialer.id))
        self.assertIsNone(select_weighted_route(self.dialer.id))

    def test_missing_weighted_routes_falls_back_as_one_atomic_policy(self):
        RoutingEndpoint.objects.filter(policy=self.policy).delete()
        cache.clear()

        with self.assertRaisesMessage(
            ValidationError,
            "Add at least one active weighted route IP before enabling.",
        ):
            self.policy.full_clean()

        self.assertIsNone(select_weighted_call_assignment(self.dialer.id))
        self.assertIsNone(select_weighted_route(self.dialer.id))

        assignment_response = self.client.post(
            reverse("check_batchnflow"),
            data={"dialer_name": self.dialer.dialer_name},
            content_type="application/json",
            **self._auth_headers(),
        )
        route_response = self.client.post(
            reverse("request_route"),
            data={"dialer_name": self.dialer.dialer_name},
            content_type="application/json",
            **self._auth_headers(),
        )

        self.assertEqual(assignment_response.json()["flow"], "Legacy Flow")
        self.assertEqual(assignment_response.json()["batch"], "7,8")
        self.assertEqual(route_response.json()["project"], "Legacy Project")
        self.assertEqual(route_response.json()["route_ip"], "192.0.2.1")

    def test_committed_admin_changes_invalidate_the_compiled_policy_cache(self):
        initial_config = get_routing_policy_config(self.dialer.id)
        self.assertEqual(initial_config["flows"][0]["weight"], 60)

        with self.captureOnCommitCallbacks(execute=True):
            self.flow_a.weight = 25
            self.flow_a.save(update_fields=["weight"])

        refreshed_config = get_routing_policy_config(self.dialer.id)
        self.assertEqual(refreshed_config["flows"][0]["weight"], 25)

    def test_duplicate_children_are_rejected_by_database_constraints(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            RoutingFlow.objects.create(
                project=self.project,
                name="A",
                weight=1,
            )

        with self.assertRaises(IntegrityError), transaction.atomic():
            RoutingEndpoint.objects.create(
                policy=self.policy,
                route_ip="198.51.100.10",
                weight=1,
            )
