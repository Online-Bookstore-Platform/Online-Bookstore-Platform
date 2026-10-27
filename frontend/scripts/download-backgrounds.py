from pathlib import Path
from urllib.request import Request, urlopen
from io import BytesIO
from PIL import Image, ImageOps
import json

root = Path('frontend/public/backgrounds')
def url(photo): return f'https://images.unsplash.com/{photo}?w=2560&h=1600&q=86&fit=crop&crop=entropy'
assets = {
'default': {'light': 'photo-1507842217343-583bb7270b66', 'dark': 'photo-1495446815901-a7297e633e8d'},
'fiction': ('photo-1524995997946-a1c2e315a42f','photo-1555041469-a586c61ea9bc'),
'fantasy': ('photo-1518709268805-4e9042af9f23','photo-1516035069371-29a1b244cc32'),
'science-fiction': ('photo-1446776811953-b23d57bd21aa','photo-1462331940025-496dfbfc7564'),
'mystery': ('photo-1509248961158-e54f6934749c','photo-1500530855697-b586d89ba3ee'),
'romance': ('photo-1516589178581-6cd7833ae3b2','photo-1518709268805-4e9042af9f23'),
'history': ('photo-1461360370896-922624d12aa1','photo-1516979187457-637abb4f9353'),
'biography': ('photo-1506794778202-cad84cf45f1d','photo-1495446815901-a7297e633e8d'),
'philosophy': ('photo-1495446815901-a7297e633e8d','photo-1519681393784-d120267933ba'),
'poetry': ('photo-1516979187457-637abb4f9353','photo-1516979187457-637abb4f9353'),
'childrens-books': ('photo-1503454537195-1dcabb73ffb9','photo-1518709268805-4e9042af9f23'),
'computing': ('photo-1518770660439-4636190af475','photo-1519389950473-47ba0277781c'),
'science': ('photo-1532094349884-543bc11b234d','photo-1462331940025-496dfbfc7564'),
'psychology': ('photo-1454165804606-c3d57bc86b40','photo-1518770660439-4636190af475'),
'business': ('photo-1460925895917-afdab827c52f','photo-1497366754035-f200968a6e72'),
'travel': ('photo-1464822759023-fed622ff2c3b','photo-1500530855697-b586d89ba3ee'),
'adventure': ('photo-1469474968028-56623f02e42e','photo-1500530855697-b586d89ba3ee'),
'classics': ('photo-1495446815901-a7297e633e8d','photo-1516979187457-637abb4f9353'),
'anime-manga': ('photo-1578632767115-351597cf2477','photo-1578632767115-351597cf2477'),
}
entries=[]
for category, pair in assets.items():
    for theme, photo in (pair.items() if isinstance(pair,dict) else zip(('light','dark'),pair)):
        dest=(root/category/theme).with_suffix('.webp')
        dest.parent.mkdir(parents=True,exist_ok=True)
        if dest.exists() and dest.stat().st_size > 0:
            try:
                with Image.open(dest) as existing: existing.verify()
                entries.append({'path':dest.as_posix(),'bytes':dest.stat().st_size})
                continue
            except Exception: dest.unlink(missing_ok=True)
        try:
            request=Request(url(photo),headers={'User-Agent':'FolioAssetBuilder/1.0'})
            with urlopen(request,timeout=18) as response:
                if response.status != 200 or not response.headers.get('Content-Type','').startswith('image/'):
                    raise RuntimeError(f'Invalid response {category}/{theme}: {response.status} {response.headers.get("Content-Type")}')
                raw=response.read()
            image=Image.open(BytesIO(raw))
        except Exception as error:
            print(f'FAILED {category}/{theme}: {error}', flush=True)
            continue
        image.verify()
        image=Image.open(BytesIO(raw))
        image=ImageOps.exif_transpose(image).convert('RGB')
        if image.width > 2048:
            height=round(image.height*2048/image.width)
            image=image.resize((2048,height),Image.Resampling.LANCZOS)
        image.save(dest,'WEBP',quality=78,method=6)
        check=Image.open(dest)
        check.verify()
        entries.append({'path':dest.as_posix(),'source':url(photo),'bytes':dest.stat().st_size,'dimensions':check.size})
        print(f'{dest.as_posix()} {check.width}x{check.height} {dest.stat().st_size:,} bytes', flush=True)
print(json.dumps({'images':len(entries),'bytes':sum(e['bytes'] for e in entries)},indent=2))
