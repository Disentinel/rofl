import sys,re,collections
# cmp.py WHOLE PART [DIFF_OUT]: the answers of a split against the whole world's; the counts are summed over workers
def norm(p):
  c=collections.Counter(); c2=collections.Counter(); rest=set()
  for l in open(p):
    m=re.match(r'side_effect_count\((\w+), (\d+), (\d+)\)',l)
    if m: c[m[1]]+=int(m[2]); c2[m[1]]+=int(m[3])
    else: rest.add(l)
  return rest, dict(c), dict(c2)
a,b=norm(sys.argv[1]),norm(sys.argv[2])
if a==b: print('SAME'); sys.exit()
print(f'DIFF rows -{len(a[0]-b[0])} +{len(b[0]-a[0])} counts {a[1]} {a[2]} vs {b[1]} {b[2]}')
if len(sys.argv)>3:
  with open(sys.argv[3],'w') as f:
    f.writelines('- '+l for l in sorted(a[0]-b[0])); f.writelines('+ '+l for l in sorted(b[0]-a[0]))
