import hashlib
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
URL = "https://raw.githubusercontent.com/kjur/jsrsasign/11.1.4/jsrsasign-all-min.js"
GIT_BLOB = "495e09b2fbb7462921027ada48ccc911c675b2de"


if __name__ == "__main__":
    with urlopen(URL, timeout=30) as response:
        source = response.read()
    blob = b"blob " + str(len(source)).encode("ascii") + b"\0" + source
    if hashlib.sha1(blob).hexdigest() != GIT_BLOB:
        raise ValueError("Le contenu ne correspond pas a la version jsrsasign attendue.")
    wrapper = (
        "function jwtLibrary_() {\n"
        "var navigator = { appName: 'Netscape', appVersion: '' };\n"
        "var window = {};\n"
        + source.decode("utf-8")
        + "\nreturn { KJUR: KJUR, KEYUTIL: KEYUTIL, b64utoutf8: b64utoutf8 };\n}\n"
    )
    destination = ROOT / "backend" / "vendor" / "jsrsasign.gs"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(wrapper, encoding="utf-8")
    print("jsrsasign 11.1.4 : source verifiee, adaptateur Apps Script genere.")