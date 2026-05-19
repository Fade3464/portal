from django.urls import path

from .views import (
    account_password_view,
    account_password_verify_view,
    account_authenticator_setup_view,
    account_authenticator_verify_view,
    account_profile_view,
    call_log_search_view,
    check_batchnflow_view,
    check_auth_view,
    check_blacklisted_number_view,
    csrf_token_view,
    create_call_log_view,
    dashboard_analytics_view,
    dashboard_filters_view,
    forgot_password_reset_view,
    forgot_password_start_view,
    forgot_password_verify_view,
    login_view,
    login_options_view,
    logout_view,
    preload_dialer_routes_view,
    request_route_view,
    update_call_log_view,
)


urlpatterns = [
    path("api/login/", login_view, name="login"),
    path("api/login/options/", login_options_view, name="login_options"),
    path("api/logout/", logout_view, name="logout"),
    path("api/check-auth/", check_auth_view, name="check_auth"),
    path("api/csrf/", csrf_token_view, name="csrf_token"),
    path("api/account/", account_profile_view, name="account_profile"),
    path(
        "api/account/recovery-authenticator/setup/",
        account_authenticator_setup_view,
        name="account_authenticator_setup",
    ),
    path(
        "api/account/recovery-authenticator/verify/",
        account_authenticator_verify_view,
        name="account_authenticator_verify",
    ),
    path(
        "api/account/password/verify/",
        account_password_verify_view,
        name="account_password_verify",
    ),
    path("api/account/password/", account_password_view, name="account_password"),
    path(
        "api/forgot-password/start/",
        forgot_password_start_view,
        name="forgot_password_start",
    ),
    path(
        "api/forgot-password/verify/",
        forgot_password_verify_view,
        name="forgot_password_verify",
    ),
    path(
        "api/forgot-password/reset/",
        forgot_password_reset_view,
        name="forgot_password_reset",
    ),
    path("api/call-logs/search/", call_log_search_view, name="call_log_search"),
    path(
        "api/dialers/preload-routes/",
        preload_dialer_routes_view,
        name="preload_dialer_routes",
    ),
    path("api/request-route/", request_route_view, name="request_route"),
    path("api/check-batchnflow/", check_batchnflow_view, name="check_batchnflow"),
    path(
        "api/dashboard/filters/",
        dashboard_filters_view,
        name="dashboard_filters",
    ),
    path(
        "api/dashboard/analytics/",
        dashboard_analytics_view,
        name="dashboard_analytics",
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
