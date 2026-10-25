import sys,re,collections
# cmp.py WHOLE PART [DIFF_OUT]: the answers of a split against the whole world's. A worker counts only its own sites and
# equal count rows of two workers are one line of the union, so the counts are recounted from the site and value rows.
def norm(p):
  rest=set(); sites=collections.defaultdict(set); valued=collections.defaultdict(set); counts={}
  for l in open(p):
    m=re.match(r'side_effect_count\((\w+), (\d+), (\d+)\)',l)
    if m: counts[m[1]]=(int(m[2]),int(m[3])); continue
    rest.add(l)
    m=re.match(r'side_effect_(site|value)\((.*?), (\w+)[,)]',l)
    if m: (sites if m[1]=='site' else valued)[m[3]].add(m[2])
  return rest,{f:(len(sites[f]),len(valued[f])) for f in sites},counts
(a,ac,acount),(b,bc,_)=norm(sys.argv[1]),norm(sys.argv[2])
if ac!=acount: print(f'WHOLE COUNTS {acount} vs recounted {ac}')
if a==b and ac==bc: print('SAME'); sys.exit()
print(f'DIFF rows -{len(a-b)} +{len(b-a)} counts {ac} vs {bc}')
if len(sys.argv)>3:
  with open(sys.argv[3],'w') as f:
    f.writelines('- '+l for l in sorted(a-b)); f.writelines('+ '+l for l in sorted(b-a))
    f.writelines(f'count {k}: {ac.get(k)} vs {bc.get(k)}\n' for k in sorted(set(ac)|set(bc)) if ac.get(k)!=bc.get(k))
