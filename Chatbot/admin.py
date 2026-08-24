from django.contrib import admin

from .models import (
    BlacklistedNumbers,
    CallLog,
    Client,
    ClientTOTPDevice,
    Dialer,
    DialerRoutingPolicy,
    RESTAPITOKENS,
    RoutingBatch,
    RoutingEndpoint,
    RoutingFlow,
    RoutingProject,
)


class ClientTOTPDeviceInline(admin.TabularInline):
    model = ClientTOTPDevice
    extra = 0
    fields = ("name", "enabled", "created_at", "last_used_at")
    readonly_fields = ("created_at", "last_used_at")


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ("client_name", "user", "email")
    search_fields = ("client_name", "user__username", "user__email")
    inlines = (ClientTOTPDeviceInline,)


@admin.register(ClientTOTPDevice)
class ClientTOTPDeviceAdmin(admin.ModelAdmin):
    list_display = ("name", "client", "enabled", "created_at", "last_used_at")
    list_filter = ("enabled", "created_at")
    search_fields = ("name", "client__client_name", "client__user__email")
    exclude = ("secret",)
    readonly_fields = ("created_at", "last_used_at")


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


class RoutingFlowInline(admin.TabularInline):
    model = RoutingFlow
    extra = 1
    fields = ("name", "weight", "active")


@admin.register(RoutingProject)
class RoutingProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "client", "active", "flow_count")
    list_filter = ("client", "active")
    search_fields = ("name", "client__client_name")
    inlines = (RoutingFlowInline,)

    @admin.display(description="Flows")
    def flow_count(self, obj):
        return obj.flows.count()


class RoutingBatchInline(admin.TabularInline):
    model = RoutingBatch
    extra = 1
    fields = ("value", "weight", "active")


@admin.register(RoutingFlow)
class RoutingFlowAdmin(admin.ModelAdmin):
    list_display = ("name", "project", "weight", "active", "batch_count")
    list_filter = ("project__client", "project", "active")
    search_fields = ("name", "project__name")
    inlines = (RoutingBatchInline,)

    @admin.display(description="Batches")
    def batch_count(self, obj):
        return obj.batches.count()


@admin.register(RoutingBatch)
class RoutingBatchAdmin(admin.ModelAdmin):
    list_display = ("value", "flow", "weight", "active")
    list_filter = ("flow__project", "flow", "active")
    search_fields = ("flow__name", "flow__project__name")


class RoutingEndpointInline(admin.TabularInline):
    model = RoutingEndpoint
    extra = 1
    fields = ("route_ip", "weight", "active")


@admin.register(DialerRoutingPolicy)
class DialerRoutingPolicyAdmin(admin.ModelAdmin):
    list_display = ("dialer", "project", "enabled", "endpoint_count")
    list_filter = ("enabled", "project")
    search_fields = ("dialer__dialer_name", "project__name")
    autocomplete_fields = ("dialer", "project")
    inlines = (RoutingEndpointInline,)

    @admin.display(description="Route IPs")
    def endpoint_count(self, obj):
        return obj.endpoints.count()


@admin.register(RoutingEndpoint)
class RoutingEndpointAdmin(admin.ModelAdmin):
    list_display = ("route_ip", "policy", "weight", "active")
    list_filter = ("policy__dialer", "active")
    search_fields = ("route_ip", "policy__dialer__dialer_name")


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
