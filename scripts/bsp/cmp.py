import sys,re,collections
def norm(p):
  c=collections.Counter(); c2=collections.Counter(); rest=set()
  for l in open(p):
    m=re.match(r'side_effect_count\((\w+), (\d+), (\d+)\)',l)
    if m: c[m[1]]+=int(m[2]); c2[m[1]]+=int(m[3])
    else: rest.add(l)
  return rest, dict(c), dict(c2)
a,b=norm(sys.argv[1]),norm(sys.argv[2])
print('SAME' if a==b else f'DIFF rows -{len(a[0]-b[0])} +{len(b[0]-a[0])} counts {a[1]} {b[1]}')
