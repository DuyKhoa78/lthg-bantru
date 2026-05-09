const fs = require('fs');
let c = fs.readFileSync('src/pages/nghiepvu/LichTrucAdmin.jsx', 'utf8');
const lines = c.split('\n');

// ── STEP 1: Replace the useEffect block (lines 381-410, idx 380-409) with useMemo ──
// Find the useEffect block start
let effStart = -1, effEnd = -1;
for (let i = 378; i < 415; i++) {
  if (lines[i] && lines[i].includes('Auto-sync: khi thay doi')) {
    effStart = i - 1; // include blank line before
    break;
  }
}
for (let i = effStart; i < 415; i++) {
  if (lines[i] && lines[i].includes('}, [lopPhongAnGroups, lopPhongNguGroups, allHsList]);')) {
    effEnd = i + 1; // include trailing blank line
    break;
  }
}

console.log('useEffect block:', effStart+1, '-', effEnd+1);

const newBlock = [
  '',
  '  // derivedHsList = merge: class-room groups (base) + individual overrides (priority)',
  '  // Dung useMemo thay vi useEffect+setState de tranh cascading renders',
  '  const derivedHsList = useMemo(() => {',
  '    const anMap = {};',
  '    lopPhongAnGroups.forEach(g => g.lops.forEach(lop => { if (lop && g.phong) anMap[lop] = g.phong; }));',
  '    const nguMap = {};',
  '    lopPhongNguGroups.forEach(g => g.lops.forEach(lop => { if (lop && g.phong) nguMap[lop] = g.phong; }));',
  '    const assignedLops = new Set([...Object.keys(anMap), ...Object.keys(nguMap)]);',
  '    // Base: class-based assignments',
  '    const map = new Map();',
  '    if (assignedLops.size > 0) {',
  '      allHsList.forEach(hs => {',
  '        if (!assignedLops.has(hs.lop)) return;',
  '        map.set(hs.id, { id: hs.id, ho_ten: hs.ho_ten, lop: hs.lop, phong_an: anMap[hs.lop] || \'\', phong_ngu: nguMap[hs.lop] || \'\' });',
  '      });',
  '    }',
  '    // Overlay: individual overrides win (higher priority)',
  '    specialHsThemVao.forEach(h => map.set(h.id, h));',
  '    return Array.from(map.values());',
  '  }, [lopPhongAnGroups, lopPhongNguGroups, allHsList, specialHsThemVao]);',
  '',
];

lines.splice(effStart, effEnd - effStart + 1, ...newBlock);
c = lines.join('\n');
fs.writeFileSync('src/pages/nghiepvu/LichTrucAdmin.jsx', c, 'utf8');
console.log('Step 1 done. Lines:', c.split('\n').length);
