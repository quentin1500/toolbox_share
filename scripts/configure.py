import configparser
import json
import os
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
FIELDS = {
    "OIDC_AUTHORITY": "authority", "OIDC_CLIENT_ID": "clientId",
    "OIDC_SCOPE": "scope", "OIDC_AUDIENCE": "audience",
    "API_URL": "apiUrl", "APP_URL": "appUrl",
}


def build_config(environment=None, env_file=None):
    environment = os.environ if environment is None else environment
    values = {}
    source = ROOT / ".env.local" if env_file is None else Path(env_file)
    if source.exists():
        parser = configparser.ConfigParser(interpolation=None, delimiters=("=",), comment_prefixes=("#",))
        parser.optionxform = str
        parser.read_string("[environment]\n" + source.read_text(encoding="utf-8-sig"))
        values.update(parser["environment"])
    values.update({key: environment[key] for key in FIELDS if key in environment})
    config = {target: values.get(key, "").strip().strip('"').strip("'") for key, target in FIELDS.items()}
    required = ["authority", "clientId", "apiUrl", "appUrl"]
    if any(config.values()) and not all(config[key] for key in required):
        raise ValueError("Configuration incomplete : authority, clientId, apiUrl et appUrl sont requis.")
    if not any(config.values()):
        return {}
    for key in ["authority", "apiUrl", "appUrl"]:
        url = urlparse(config[key])
        local_app = key == "appUrl" and url.hostname in ("localhost", "127.0.0.1") and url.scheme == "http"
        if (url.scheme != "https" and not local_app) or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError(f"URL non autorisee : {key}")
    api = urlparse(config["apiUrl"])
    if api.hostname != "script.google.com" or not api.path.startswith("/macros/s/") or not api.path.endswith("/exec"):
        raise ValueError("API_URL doit etre une URL de deploiement Apps Script /exec.")
    if set(config["scope"].split()) != {"openid", "email", "profile"}:
        raise ValueError("OIDC_SCOPE doit contenir uniquement openid, email et profile.")
    return config


def write_config():
    config = build_config()
    destination = ROOT / "public" / "config.js"
    destination.write_text("window.APP_CONFIG = " + json.dumps(config, ensure_ascii=True) + ";\n", encoding="utf-8")
    return bool(config)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generation de configuration publique")
    parser.add_argument("--require", action="store_true", help="Refuser le mode demonstration")
    args = parser.parse_args()
    if args.require and not build_config():
        raise ValueError("La publication exige une configuration OIDC et API complete.")
    configured = write_config()
    print("Configuration publique generee." if configured else "Mode demonstration : aucune configuration OIDC.")