"""Build data/lorenz2011.js and data/becker2017.js from the papers' supplementary datasets.

Inputs (download from each paper's Supplementary Material on pnas.org):
  Lorenz, Rauhut, Schweitzer & Helbing (2011), PNAS 108(22):9020-9025, Dataset S1: sd01.xls
  Becker, Brackbill & Centola (2017), PNAS 114(26):E5070-E5076, Dataset S1: pnas.1615978114.sd01.csv

Usage:
  python data/prep_influence.py path/to/sd01.xls path/to/pnas.1615978114.sd01.csv

Becker et al. report each person's mean of their neighbours' estimates but not the network
itself. The ties are recovered here: for each person, the smallest set of group members whose
round-1 and round-2 estimates average to the recorded neighbour means on every question.
Decentralised networks come out with 4 neighbours each (3 where a neighbour skipped a
question); centralised networks come out as stars, every peripheral person seeing only the hub.
"""
import itertools
import json
import os
import sys
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
OUT = os.path.dirname(os.path.abspath(__file__))

LORENZ_QUESTIONS = {  # Lorenz et al. (2011), Table 1
    1: ("Population density of Switzerland", "people per km²", 184),
    2: ("Length of the border between Switzerland and Italy", "km", 734),
    3: ("New residents who moved to Zurich in 2006", "people", 10067),
    4: ("Murders registered in Switzerland in 2006", "murders", 198),
    5: ("Rapes registered in Switzerland in 2006", "rapes", 639),
    6: ("Assaults registered in Switzerland in 2006", "assaults", 9272),
}
CONDITIONS = {"no": "none", "aggregated": "mean", "full": "all"}


def num(x):
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return None
    return int(x) if float(x).is_integer() else round(float(x), 4)


def lorenz(path):
    L = pd.read_excel(path)
    L = L.drop(columns=L.columns[0])
    sessions = sorted(L.Session_Date.unique())
    groups = []
    for (sess, q), g in L.groupby(["Session_Date", "Question"]):
        g = g.sort_values("Subject")
        est = g[["E1", "E2", "E3", "E4", "E5"]].astype(float).values
        est[est <= 0] = np.nan          # one estimate of 0 (session 081120_0951, Q6, subject 9, round 3)
        groups.append({
            "session": sessions.index(sess), "question": int(q),
            "condition": CONDITIONS[g.Information_Condition.iloc[0]],
            "est": [[num(v) for v in row] for row in est],
            "conf": [[int(a), int(b)] for a, b in zip(g.C1, g.C5)],
        })
    questions = [{"id": k, "text": t, "unit": u, "truth": v} for k, (t, u, v) in LORENZ_QUESTIONS.items()]
    label = [f"20{s[:2]}-{s[2:4]}-{s[4:6]} {s[7:9]}:{s[9:11]}" for s in sessions]
    return questions, label, groups


def recover_ties(g):
    R1 = g.pivot_table(index="subject_id", columns="task", values="response_1", dropna=False)
    R2 = g.pivot_table(index="subject_id", columns="task", values="response_2", dropna=False).reindex_like(R1)
    M1 = g.pivot_table(index="subject_id", columns="task", values="mean.neighbor.time1", dropna=False).reindex_like(R1)
    M2 = g.pivot_table(index="subject_id", columns="task", values="mean.neighbor.time2", dropna=False).reindex_like(R1)
    ids = list(R1.index)
    ties = {}
    for ii in range(len(ids)):
        t1, t2 = M1.values[ii], M2.values[ii]
        ok1, ok2 = ~np.isnan(t1), ~np.isnan(t2)
        if not (ok1.any() or ok2.any()):
            continue
        others = np.array([j for j in range(len(ids)) if j != ii])
        for k in range(1, 7):
            combos = np.array(list(itertools.combinations(others, k)))
            m1 = np.nanmean(R1.values[combos][:, :, ok1], axis=1)
            m2 = np.nanmean(R2.values[combos][:, :, ok2], axis=1)
            hit = np.flatnonzero(np.all(np.abs(m1 - t1[ok1]) <= 0.51, axis=1) & np.all(np.abs(m2 - t2[ok2]) <= 0.51, axis=1))
            if len(hit):
                ties[ids[ii]] = [ids[j] for j in combos[hit[0]]]
                break
    return ties


def becker(path):
    B = pd.read_csv(path)
    groups = []
    for (net, gid), g in B.groupby(["network", "group_number"]):
        people = sorted(g.subject_id.unique())
        index = {s: i for i, s in enumerate(people)}
        hub = None
        if net == "Centralized":
            hub = index[g[g.is_central == True].subject_id.iloc[0]]
        edges = set()
        if net == "Centralized":
            edges = {(hub, i) if hub < i else (i, hub) for i in range(len(people)) if i != hub}
        elif net == "Decentralized":
            for s, nbrs in recover_ties(g).items():
                for t in nbrs:
                    a, b = index[s], index[t]
                    edges.add((min(a, b), max(a, b)))
        tasks = []
        for task, t in g.groupby("task", sort=False):
            est = [[None, None, None] for _ in people]
            for _, r in t.iterrows():
                est[index[r.subject_id]] = [num(r.response_1), num(r.response_2), num(r.response_3)]
            tasks.append({"code": task, "kind": "count" if int(task[0]) <= 4 else "percent",
                          "truth": num(t.truth.iloc[0]), "sd": num(t.sd_pool.iloc[0]), "est": est})
        groups.append({"id": int(gid), "network": {"Decentralized": "decentralized", "Centralized": "centralized", "Solo": "none"}[net],
                       "n": len(people), "hub": hub, "edges": sorted(edges), "tasks": tasks})
        print(f"becker {net:13s} group {gid:2d}: {len(people)} people, {len(edges)} ties, {len(tasks)} questions")
    return groups


def write(name, header, exports):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(header)
        for k, v in exports.items():
            f.write(f"export const {k} = {json.dumps(v, separators=(',', ':'), ensure_ascii=False)};\n")


if __name__ == "__main__":
    questions, sessions, lgroups = lorenz(sys.argv[1])
    write("lorenz2011.js", """// Lorenz, J., Rauhut, H., Schweitzer, F., & Helbing, D. (2011). How social influence can undermine
// the wisdom of crowd effect. PNAS, 108(22), 9020-9025. doi:10.1073/pnas.1008636108
//
// Built by data/prep_influence.py from the paper's Dataset S1. 12 sessions of 12 people, 6 questions
// each, 5 estimates per question. Each session answered two questions in each information condition:
// "none" (own estimate only), "mean" (the arithmetic mean of everyone's last estimate), "all" (every
// estimate). est[i] = person i's 5 estimates (null where 0 was entered); conf[i] = their confidence
// (1-6) after the first and the last estimate.
""", {"QUESTIONS": questions, "SESSIONS": sessions, "GROUPS": lgroups})
    bgroups = becker(sys.argv[2])
    write("becker2017.js", """// Becker, J., Brackbill, D., & Centola, D. (2017). Network dynamics of social influence in the wisdom
// of crowds. PNAS, 114(26), E5070-E5076. doi:10.1073/pnas.1615978114
//
// Built by data/prep_influence.py from the paper's Dataset S1. Groups of about 40 people gave 3
// estimates per question: one alone, then two after seeing the mean of their neighbours' estimates.
// network: "decentralized" (each person tied to 4 others), "centralized" (a star: everyone sees only
// the hub, the hub sees everyone) or "none" (control, no social information). The ties are not in the
// dataset; they are recovered from the recorded neighbour means (see the script). Questions 1-4 are
// counts and 5-9 percentages, judged from images; est[i] = person i's 3 estimates (null if skipped);
// sd = the spread of independent first estimates, which Becker et al. use as the unit of error.
""", {"GROUPS": bgroups})
    print("wrote", os.path.join(OUT, "lorenz2011.js"), "and becker2017.js")
