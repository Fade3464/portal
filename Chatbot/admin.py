from django.contrib import admin

from .models import BlacklistedNumbers, CallLog, Client, Dialer, RESTAPITOKENS


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ("client_name", "user", "email")
    search_fields = ("client_name", "user__username", "user__email")


@admin.register(Dialer)
class DialerAdmin(admin.ModelAdmin):
    list_display = (
        "dialer_name",
        "client",
        "project",
        "xferexten",
        "agent_count",
        "batch",
        "flow",
        "active",
    )
    list_filter = ("client", "flow", "active")
    search_fields = ("dialer_name", "project", "route_ip", "flow")


@admin.register(CallLog)
class CallLogAdmin(admin.ModelAdmin):
    list_display = (
        "call_uuid",
        "call_id",
        "dialer",
        "status",
        "state",
        "flow",
        "batch",
        "duration",
        "call_recording_link",
        "created_at",
    )
    list_filter = ("status", "state", "created_at")
    search_fields = ("call_uuid", "call_id", "status", "state")


@admin.register(BlacklistedNumbers)
class BlacklistedNumbersAdmin(admin.ModelAdmin):
    list_display = ("number", "reason")
    search_fields = ("number", "reason")


@admin.register(RESTAPITOKENS)
class RESTAPITOKENSAdmin(admin.ModelAdmin):
    list_display = ("masked_token", "is_active", "created_at")
    list_filter = ("is_active", "created_at")
    search_fields = ("token",)
    readonly_fields = ("created_at",)

    @admin.display(description="Token")
    def masked_token(self, obj):
        return obj.masked_token
