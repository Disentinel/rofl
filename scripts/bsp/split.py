import re,sys,os
# split.py K OUT FN SRC... : files balanced by bytes over K groups, core lines in every group
K=int(sys.argv[1]); out=sys.argv[2]; fn=sys.argv[3]; srcs=sys.argv[4:]
NODE=re.compile(r'\bn([0-9a-f]{16})_[0-9a-z]+')
order=[]; core=[]; seen=set(); by={}; size={}
for src in srcs:
  buf=''
  for raw in open(src, errors='surrogateescape'):
    line=buf+raw if buf else raw
    q=len(re.findall(r'(?<!\\)"',line.replace('\\\\','')))
    if q%2: buf=line; continue
    buf=''
    ps=NODE.search(line)
    if not ps:
      if line not in seen: seen.add(line); core.append(line)
      continue
    p=ps.group(1)
    if p not in by: by[p]=[]; order.append(p); size[p]=0
    by[p].append(line); size[p]+=len(line)
load=[0]*K; gs=[[] for _ in range(K)]
for p in sorted(order,key=lambda p:-size[p]):
  g=load.index(min(load)); gs[g].append(p); load[g]+=size[p]
print(len(order),'files',len(core),'core', [round(l/1e6,1) for l in load],'MB')
for g in range(K):
  d=f'{out}/g{g}'; os.makedirs(d,exist_ok=True)
  with open(f'{d}/{fn}','w',errors='surrogateescape') as f:
    f.writelines(core)
    for p in gs[g]: f.writelines(by[p])
