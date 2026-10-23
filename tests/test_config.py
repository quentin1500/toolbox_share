import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("configure", Path(__file__).resolve().parent.parent / "scripts" / "configure.py")
configure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configure)


class ConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env_file = Path(self.directory.name) / ".env.local"
        self.values = {
            "OIDC_AUTHORITY": "https://identity.example/", "OIDC_CLIENT_ID": "spa",
            "OIDC_SCOPE": "openid email profile", "API_URL": "https://script.google.com/macros/s/test/exec",
            "APP_URL": "http://localhost:8000/",
        }

    def test_empty_is_explicit_demo(self):
        self.assertEqual(configure.build_config({}, self.env_file), {})

    def test_public_allowlist_and_environment_priority(self):
        self.env_file.write_text("OIDC_CLIENT_ID=local\nCLIENT_SECRET=never-publish\n", encoding="utf-8")
        result = configure.build_config(self.values, self.env_file)
        self.assertEqual(result["clientId"], "spa")
        self.assertNotIn("CLIENT_SECRET", str(result))

    def test_incomplete_or_unsafe_urls_are_rejected(self):
        for values in [{"OIDC_CLIENT_ID": "spa"}, {**self.values, "API_URL": "https://attacker.example/exec"},
                       {**self.values, "APP_URL": "http://example.com/"},
                       {**self.values, "OIDC_AUTHORITY": "https://user:password@example.com"}]:
            with self.assertRaises(ValueError):
                configure.build_config(values, self.env_file)

    def test_only_standard_oidc_scopes_are_allowed(self):
        self.assertEqual(configure.build_config(self.values, self.env_file)["scope"], "openid email profile")
        for scope in ["openid email profile tools", "openid email", "openid profile", ""]:
            with self.assertRaises(ValueError):
                configure.build_config({**self.values, "OIDC_SCOPE": scope}, self.env_file)


if __name__ == "__main__":
    unittest.main()