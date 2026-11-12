"""
Flask Application Factory - Workstream 5
Configures application instances, registers security middleware, and binds routes.
"""

from flask import Flask, Response
from intentlock.workstream5_api_db.routes import build_api_blueprint, build_v2_api_blueprint

def create_app(engine=None) -> Flask:
    app = Flask(__name__)
    if engine is None:
        from intentlock.engine import IntentLockEngine
        engine = IntentLockEngine()

    app.config["ENGINE"] = engine

    # Security Headers Middleware
    @app.after_request
    def set_security_headers(response: Response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        return response

    blueprint = build_api_blueprint(engine)
    app.register_blueprint(blueprint)
    app.register_blueprint(build_v2_api_blueprint(engine))

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(host="127.0.0.1", port=8000, debug=False)
