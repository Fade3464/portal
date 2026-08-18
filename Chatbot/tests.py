from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .api_token_cache import preload_active_api_tokens
from .models import Client, Dialer, RESTAPITOKENS


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
