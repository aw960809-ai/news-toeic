from pathlib import Path
import re,shutil,json
R=Path(__file__).resolve().parents[1];out=R/'_site'
if out.exists():shutil.rmtree(out)
out.mkdir()
files=['index.html','styles.css','sw.js','manifest-original.webmanifest','manifest.webmanifest','icon-original-192.png','icon-original-512.png','apple-touch-original.png','release.json']
files += re.findall(r'<script[^>]+src="\./([^"]+)"',(R/'index.html').read_text())
for name in files:
 src=R/name
 if src.is_file():shutil.copy2(src,out/name)
for name in ['assets','data','audio']:
 if (R/name).is_dir():shutil.copytree(R/name,out/name)
(out/'.nojekyll').write_text('')
print('SITE_ASSEMBLED',out)
