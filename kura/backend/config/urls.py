from django.urls import path, re_path
from django.conf import settings
from django.http import FileResponse, HttpResponse
from meetings import views as v


def web(request):
    p = settings.BASE_DIR / "web/index.html"
    return (
        FileResponse(p.open("rb"), content_type="text/html")
        if p.exists()
        else HttpResponse(
            "Kura API is running. Build the Flutter web client.", status=503
        )
    )


urlpatterns = [
    path("healthz", v.health),
    path("api/login", v.login),
    path("api/logout", v.logout),
    path("api/meetings", v.meetings),
    path("api/meetings/<uuid:id>", v.meeting),
    path("api/meetings/<uuid:id>/chunks/<int:seq>", v.chunk),
    path("api/meetings/<uuid:id>/finish", v.finish),
    path("api/meetings/<uuid:id>/stop", v.stop),
    path("api/meetings/<uuid:id>/retry", v.retry),
    path("api/meetings/<uuid:id>/export", v.export),
    path("api/audio/<str:ticket>", v.audio),
    path("api/internal/claim", v.internal, {"action": "claim"}),
    path(
        "api/internal/meetings/<uuid:id>/chunks/<int:seq>",
        v.internal,
        {"action": "chunks"},
    ),
    path("api/internal/meetings/<uuid:id>/<str:action>", v.internal),
    re_path(r"^(?!api/).*$", web),
]
