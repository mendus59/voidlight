# Builds a single-file version of the game (dist/voidlight.html) with all scripts inlined.
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text()
for name in ['firebase-config', 'core', 'items', 'chain', 'content', 'progress', 'main']:
    js = (root / 'src' / f'{name}.js').read_text()
    html = html.replace(f'<script src="src/{name}.js"></script>', '<script>\n' + js + '\n</script>')
js = (root / 'src' / 'cloud.js').read_text()
html = html.replace('<script type="module" src="src/cloud.js"></script>', '<script type="module">\n' + js + '\n</script>')
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'voidlight.html').write_text(html)
# artifact variant: no document skeleton tags
art = re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>\s*', '', html)
art = re.sub(r'<meta charset[^>]*>\s*<meta name="viewport"[^>]*>\s*', '', art)
art = art.replace('</head>\n<body>\n', '').replace('</body>\n</html>\n', '')
(root / 'dist' / 'artifact.html').write_text(art)
print('built', len(html), len(art))
