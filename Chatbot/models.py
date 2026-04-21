import uuid

from django.conf import settings
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
