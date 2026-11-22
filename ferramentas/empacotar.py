"""Prepara os arquivos e atualiza o ZIP que pode ser enviado ao Cloudflare Pages."""
from pathlib import Path
from subprocess import run
from tempfile import NamedTemporaryFile
from zipfile import ZipFile, ZIP_DEFLATED

raiz = Path(__file__).resolve().parents[1]
publico = raiz / "site"
destino = raiz / "PUBLICAR_NO_CLOUDFLARE.zip"
run(["node", "ferramentas/preparar.mjs"], cwd=raiz, check=True)
with NamedTemporaryFile(dir=raiz, prefix="publicar-", suffix=".tmp", delete=False) as tmp:
    temporario = Path(tmp.name)
try:
    with ZipFile(temporario, "w", compression=ZIP_DEFLATED, compresslevel=9) as pacote:
        for arquivo in sorted(publico.rglob("*")):
            if arquivo.is_file() and not any(parte.startswith(".") for parte in arquivo.relative_to(publico).parts):
                pacote.write(arquivo, arquivo.relative_to(publico).as_posix())
    temporario.replace(destino)
finally:
    temporario.unlink(missing_ok=True)
print(destino.name)

