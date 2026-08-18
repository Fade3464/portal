from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import (
    DialerRoutingPolicy,
    RoutingBatch,
    RoutingEndpoint,
    RoutingFlow,
    RoutingProject,
)
from .routing import invalidate_routing_policy_cache


@receiver(
    [post_save, post_delete],
    sender=RoutingProject,
    dispatch_uid="invalidate_routing_project_cache",
)
@receiver(
    [post_save, post_delete],
    sender=RoutingFlow,
    dispatch_uid="invalidate_routing_flow_cache",
)
@receiver(
    [post_save, post_delete],
    sender=RoutingBatch,
    dispatch_uid="invalidate_routing_batch_cache",
)
@receiver(
    [post_save, post_delete],
    sender=DialerRoutingPolicy,
    dispatch_uid="invalidate_dialer_routing_policy_cache",
)
@receiver(
    [post_save, post_delete],
    sender=RoutingEndpoint,
    dispatch_uid="invalidate_routing_endpoint_cache",
)
def invalidate_routing_cache_after_change(**kwargs):
    transaction.on_commit(invalidate_routing_policy_cache)
