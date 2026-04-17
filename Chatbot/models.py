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
    backup_email = models.EmailField(blank=True)

    class Meta:
        ordering = ["client_name"]

    def __str__(self) -> str:
        return self.client_name

    @property
    def email(self) -> str:
        return self.user.email


class Dialer(models.Model):
    dialer_name = models.CharField(max_length=255)
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name="dialers",
    )
    project = models.CharField(max_length=255)
    xferexten = models.IntegerField()
    agent_count = models.IntegerField()
    batch = models.IntegerField()
    route_ip = models.TextField(
        help_text="Store one or more IPs. Separate multiple IPs with commas or new lines."
    )
    flow = models.CharField(max_length=255)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["dialer_name"]

    def __str__(self) -> str:
        return self.dialer_name


class CallLog(models.Model):
    call_uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    call_id = models.BigIntegerField(
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
    status = models.CharField(max_length=255)
    state = models.CharField(max_length=255, null=True, blank=True)
    duration = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self) -> str:
        return str(self.call_id)

    @property
    def flow(self) -> str:
        return self.dialer.flow

    @property
    def batch(self) -> int:
        return self.dialer.batch


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

    def __str__(self) -> str:
        return self.token
