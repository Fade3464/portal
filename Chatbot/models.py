import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Client(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="client_profile",
    )
    client_name = models.CharField(max_length=255)
    recovery_totp_secret = models.CharField(max_length=64, blank=True)
    recovery_totp_enabled = models.BooleanField(default=False)

    class Meta:
        ordering = ["client_name"]

    def __str__(self) -> str:
        return self.client_name

    @property
    def email(self) -> str:
        return self.user.email


class Dialer(models.Model):
    dialer_name = models.CharField(max_length=255, db_index=True)
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name="dialers",
    )
    project = models.CharField(max_length=255)
    xferexten = models.CharField(max_length=64)
    agent_api_url = models.URLField(max_length=1000, null=True, blank=True)
    non_agent_api_url = models.URLField(max_length=1000, null=True, blank=True)
    api_user = models.CharField(max_length=255, null=True, blank=True)
    api_password = models.CharField(max_length=255, null=True, blank=True)
    agent_count = models.IntegerField()
    batch = models.CharField(max_length=255)
    batch_cursor = models.PositiveIntegerField(default=0)
    route_ip = models.TextField(
        help_text="Store one or more IPs. Separate multiple IPs with commas or new lines."
    )
    flow = models.CharField(max_length=255)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["dialer_name"]
        indexes = [
            models.Index(
                fields=["client", "active", "dialer_name"],
                name="dialer_client_active_name_idx",
            ),
            models.Index(
                fields=["client", "active", "id"],
                name="dialer_client_active_id_idx",
            ),
        ]

    def __str__(self) -> str:
        return self.dialer_name


class RoutingProject(models.Model):
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name="routing_projects",
    )
    name = models.CharField(max_length=255)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["client__client_name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["client", "name"],
                name="routing_project_client_name_unique",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.client.client_name} / {self.name}"


class RoutingFlow(models.Model):
    project = models.ForeignKey(
        RoutingProject,
        on_delete=models.CASCADE,
        related_name="flows",
    )
    name = models.CharField(max_length=255)
    weight = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text="Relative distribution weight. For example, use 60 and 40 for a 60/40 split.",
    )
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["project__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "name"],
                name="routing_flow_project_name_unique",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.project.name} / {self.name}"


class RoutingBatch(models.Model):
    flow = models.ForeignKey(
        RoutingFlow,
        on_delete=models.CASCADE,
        related_name="batches",
    )
    value = models.IntegerField()
    weight = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text="Relative distribution weight within this flow.",
    )
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["flow__project__name", "flow__name", "value"]
        constraints = [
            models.UniqueConstraint(
                fields=["flow", "value"],
                name="routing_batch_flow_value_unique",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.flow} / Batch {self.value}"


class DialerRoutingPolicy(models.Model):
    dialer = models.OneToOneField(
        Dialer,
        on_delete=models.CASCADE,
        related_name="routing_policy",
    )
    project = models.ForeignKey(
        RoutingProject,
        on_delete=models.PROTECT,
        related_name="dialer_policies",
    )
    enabled = models.BooleanField(
        default=False,
        help_text="Enable only after the project flows, batches, and route IPs are configured.",
    )

    class Meta:
        ordering = ["dialer__dialer_name"]
        verbose_name_plural = "Dialer routing policies"

    def __str__(self) -> str:
        return f"{self.dialer.dialer_name} -> {self.project.name}"

    def clean(self):
        super().clean()
        if not self.enabled or not self.project_id:
            return

        errors = self.get_configuration_errors()
        if errors:
            raise ValidationError({"enabled": " ".join(errors)})

    def get_configuration_errors(self):
        if not self.project_id:
            return ["Select a routing project."]

        if self.dialer_id and self.project.client_id != self.dialer.client_id:
            return ["The routing project and dialer must belong to the same client."]

        if not self.project.active:
            return ["The selected routing project is inactive."]

        if not (self.project.name or "").strip():
            return ["The routing project must have a name."]

        active_flows = list(
            self.project.flows.filter(active=True).prefetch_related("batches")
        )
        if not active_flows:
            return ["Add at least one active flow before enabling this policy."]

        invalid_flows = [
            flow.name or f"ID {flow.id}"
            for flow in active_flows
            if not (flow.name or "").strip() or flow.weight <= 0
        ]
        if invalid_flows:
            return [
                "Every active flow needs a name and positive weight. "
                f"Invalid: {', '.join(invalid_flows)}."
            ]

        flows_without_batches = [
            flow.name
            for flow in active_flows
            if not any(batch.active and batch.weight > 0 for batch in flow.batches.all())
        ]
        if flows_without_batches:
            return [
                "Every active flow needs an active batch before enabling. "
                f"Missing: {', '.join(flows_without_batches)}."
            ]

        if not self.pk:
            return [
                "Save this policy disabled, add its route IPs, then enable it."
            ]

        valid_endpoint_exists = any(
            endpoint.active
            and endpoint.weight > 0
            and (endpoint.route_ip or "").strip()
            and not any(
                separator in endpoint.route_ip for separator in (",", "\n", "\r")
            )
            for endpoint in self.endpoints.all()
        )
        if not valid_endpoint_exists:
            return ["Add at least one active weighted route IP before enabling."]

        return []


class RoutingEndpoint(models.Model):
    policy = models.ForeignKey(
        DialerRoutingPolicy,
        on_delete=models.CASCADE,
        related_name="endpoints",
    )
    route_ip = models.CharField(max_length=255)
    weight = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text="Relative distribution weight. For example, use 60 and 40 for a 60/40 split.",
    )
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["policy__dialer__dialer_name", "route_ip"]
        constraints = [
            models.UniqueConstraint(
                fields=["policy", "route_ip"],
                name="routing_endpoint_policy_ip_unique",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.policy.dialer.dialer_name} / {self.route_ip}"

    def clean(self):
        super().clean()
        self.route_ip = (self.route_ip or "").strip()
        if not self.route_ip or any(separator in self.route_ip for separator in (",", "\n", "\r")):
            raise ValidationError(
                {"route_ip": "Enter one IP address or hostname per route row."}
            )


class CallLog(models.Model):
    call_uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    call_id = models.BigIntegerField(
        db_index=True,
        validators=[
            MinValueValidator(1_000_000_000),
            MaxValueValidator(9_999_999_999),
        ],
        help_text="Must be a 10-digit integer.",
    )
    dialer = models.ForeignKey(
        Dialer,
        on_delete=models.CASCADE,
        related_name="call_logs",
    )
    status = models.CharField(max_length=255, db_index=True)
    state = models.CharField(max_length=255, null=True, blank=True)
    flow = models.CharField(max_length=255, blank=True, default="")
    batch = models.IntegerField(default=0)
    duration = models.IntegerField(default=0)
    call_recording_link = models.URLField(max_length=1000, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(
                fields=["dialer", "-created_at", "-id"],
                name="cl_dialer_created_id_idx",
            ),
            models.Index(
                fields=["dialer", "status", "-created_at", "-id"],
                name="cl_dialer_status_created_idx",
            ),
            models.Index(
                fields=["-created_at", "-id"],
                name="cl_created_id_idx",
            ),
        ]

    def __str__(self) -> str:
        return str(self.call_id)


class CallLogMinuteRollup(models.Model):
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name="call_log_minute_rollups",
    )
    dialer = models.ForeignKey(
        Dialer,
        on_delete=models.CASCADE,
        related_name="call_log_minute_rollups",
    )
    bucket_start = models.DateTimeField()
    status = models.CharField(max_length=255, db_index=True)
    flow = models.CharField(max_length=255, blank=True, default="")
    batch = models.IntegerField(default=0)
    call_count = models.PositiveIntegerField(default=0)
    total_duration = models.BigIntegerField(default=0)

    class Meta:
        ordering = ["-bucket_start", "dialer_id", "status", "flow", "batch"]
        constraints = [
            models.UniqueConstraint(
                fields=["client", "dialer", "bucket_start", "status", "flow", "batch"],
                name="cl_minute_rollup_unique",
            ),
        ]
        indexes = [
            models.Index(
                fields=["client", "bucket_start"],
                name="clmr_client_bucket_idx",
            ),
            models.Index(
                fields=["client", "dialer", "bucket_start"],
                name="clmr_client_dialer_bucket_idx",
            ),
            models.Index(
                fields=["client", "status", "bucket_start"],
                name="clmr_client_status_bucket_idx",
            ),
            models.Index(
                fields=["client", "flow", "batch", "bucket_start"],
                name="clmr_cli_flow_batch_idx",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"{self.client_id}:{self.dialer_id}:{self.bucket_start.isoformat()}:"
            f"{self.status}:{self.flow}:{self.batch}"
        )


class BlacklistedNumbers(models.Model):
    number = models.BigIntegerField(
        unique=True,
        validators=[
            MinValueValidator(1_000_000_000),
            MaxValueValidator(9_999_999_999),
        ],
        help_text="Must be a 10-digit integer.",
    )
    reason = models.CharField(max_length=255)

    class Meta:
        ordering = ["number"]
        verbose_name_plural = "Blacklisted numbers"

    def __str__(self) -> str:
        return str(self.number)


class RESTAPITOKENS(models.Model):
    token = models.CharField(max_length=255, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]
        verbose_name = "REST API token"
        verbose_name_plural = "REST API tokens"

    @property
    def masked_token(self) -> str:
        if len(self.token) <= 8:
            return "*" * len(self.token)

        return f"{self.token[:4]}...{self.token[-4:]}"

    def __str__(self) -> str:
        return self.masked_token


class LoginRateLimit(models.Model):
    ip_address = models.GenericIPAddressField(unique=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    last_failed_at = models.DateTimeField(null=True, blank=True)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["ip_address"]
        verbose_name = "Login rate limit"
        verbose_name_plural = "Login rate limits"

    def __str__(self) -> str:
        return self.ip_address
