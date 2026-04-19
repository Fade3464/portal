from django.urls import path

from .views import (
    account_password_view,
    account_password_verify_view,
    account_profile_view,
    check_auth_view,
    check_blacklisted_number_view,
    create_call_log_view,
    dashboard_filters_view,
    login_view,
    logout_view,
    update_call_log_view,
)


urlpatterns = [
    path("api/login/", login_view, name="login"),
    path("api/logout/", logout_view, name="logout"),
    path("api/check-auth/", check_auth_view, name="check_auth"),
    path("api/account/", account_profile_view, name="account_profile"),
    path(
        "api/account/password/verify/",
        account_password_verify_view,
        name="account_password_verify",
    ),
    path("api/account/password/", account_password_view, name="account_password"),
    path(
        "api/dashboard/filters/",
        dashboard_filters_view,
        name="dashboard_filters",
    ),
    path("api/call-logs/create/", create_call_log_view, name="create_call_log"),
    path(
        "api/call-logs/<uuid:call_uuid>/update/",
        update_call_log_view,
        name="update_call_log",
    ),
    path(
        "api/blacklisted-numbers/<int:call_id>/check/",
        check_blacklisted_number_view,
        name="check_blacklisted_number",
    ),
]
