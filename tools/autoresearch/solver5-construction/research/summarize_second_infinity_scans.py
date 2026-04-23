import json
import os
from glob import glob

PREFIX = '.pi/autoresearch-archive/rgdd20-research/scan_second_given_*.log'

for path in sorted(glob(PREFIX)):
    items = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('{'):
                items.append(json.loads(line))
    if not items:
        continue
    first = items[0]['first_block_coords']
    inf = [it['second_block_coords'] for it in items if it['status'] == 'INFEASIBLE']
    unk = [it['second_block_coords'] for it in items if it['status'] == 'UNKNOWN']
    print('===', os.path.basename(path))
    print('first', first)
    print('counts', {'items': len(items), 'infeasible': len(inf), 'unknown': len(unk)})
    print('infeasible', inf)
    print('---')
