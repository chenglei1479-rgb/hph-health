# -*- coding: utf-8 -*-
# 用法：python3 validate.py [dev|holdout|all]（默认 all）。holdout 只校验结构与 SHA256，不打印内容。
import json,sys,os,re,hashlib
B=os.path.dirname(os.path.abspath(__file__))
FW=str.maketrans('０１２３４５６７８９','0123456789')
def chk(m):
    d=[int(c) for c in m];s=sum(d[11-n]*(n+1 if n<=6 else n-5) for n in range(1,12));r=s%11
    return d[11]==(0 if r<=1 else 11-r)
def mn_ok(t,flag):
    d=re.sub(r"\D","",t.translate(FW))
    return len(d)==12 and (chk(d) if flag is not False else not chk(d))
def run(base,quiet):
    err=0;say=(lambda *a:None) if quiet else print
    docs={};ids=set();sp={}
    for i,l in enumerate(open(os.path.join(base,"records_gold.jsonl"),encoding="utf-8"),1):
        g=json.loads(l);p=os.path.join(base,"records",g["record"])
        if p not in docs: docs[p]=open(p,encoding="utf-8").read()
        if docs[p][g["start"]:g["end"]]!=g["text"]: say("MISMATCH",i,g);err+=1
        if g["category"]=="MY_NUMBER" and not mn_ok(g["text"],g.get("checksum_valid")): say("BAD MYNUM",i);err+=1
        sp.setdefault(g["record"],[]).append((g["start"],g["end"]))
    if set(os.listdir(os.path.join(base,"records")))!=set(os.path.basename(p) for p in docs): say("RECORD WITHOUT GOLD");err+=1
    for l in open(os.path.join(base,"entities.jsonl"),encoding="utf-8"):
        e=json.loads(l)
        if e["id"] in ids: say("DUP ID",e["id"]);err+=1
        ids.add(e["id"])
        if e["text"][e["value_start"]:]!=e["value"]: say("BAD VALUE",e["id"]);err+=1
        if e["category"]=="MY_NUMBER" and not mn_ok(e["text"],e.get("checksum_valid")): say("BAD MYNUM",e["id"]);err+=1
    for r,v in sp.items():
        v.sort()
        for a,b in zip(v,v[1:]):
            if b[0]<a[1]: say("OVERLAP",r,a,b);err+=1
    return err,ids
err=0;mode=(sys.argv[1] if len(sys.argv)>1 else "all")
dev_ids=set();ho_ids=set()
if mode in("dev","all"):
    e,dev_ids=run(B,False);print("dev:",e,"errors");err+=e
if mode in("holdout","all"):
    H=os.path.join(B,"holdout")
    for l in open(os.path.join(H,"MANIFEST.sha256"),encoding="utf-8"):
        h,p=l.rstrip("\n").split("  ",1)
        if hashlib.sha256(open(os.path.join(H,p),"rb").read()).hexdigest()!=h: print("SHA256 MISMATCH",p);err+=1
    e,ho_ids=run(H,True);print("holdout:",e,"errors (内容不打印)");err+=e
if dev_ids&ho_ids: print("ID LEAK dev∩holdout",len(dev_ids&ho_ids));err+=1
print("FAIL" if err else "PASS",err);sys.exit(1 if err else 0)
