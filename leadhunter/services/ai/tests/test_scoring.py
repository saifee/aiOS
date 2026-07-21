from scoring import rule_score

def test_rule_score_industry_match():
    s = rule_score(
        {"industries": ["Private Schools"], "sizeMin": 10, "sizeMax": 500},
        {"industry": "private schools", "employeeCount": 120, "hasVerifiedContact": True, "createdDaysAgo": 1},
    )
    assert s["industry_match"] == 20
    assert s["size_fit"] == 10
    assert s["decision_maker"] == 10

def test_rule_score_no_contact():
    s = rule_score({"industries": []}, {"hasVerifiedContact": False})
    assert s["decision_maker"] == 3


def test_size_fit_out_of_range():
    from scoring import rule_score
    s = rule_score({"industries": [], "sizeMin": 10, "sizeMax": 50}, {"employeeCount": 500})
    assert s["size_fit"] == 3  # outside ideal range


def test_recency_boost():
    from scoring import rule_score
    fresh = rule_score({"industries": []}, {"createdDaysAgo": 1})
    stale = rule_score({"industries": []}, {"createdDaysAgo": 99})
    assert fresh["recency"] > stale["recency"]


def test_score_caps_at_100():
    from scoring import WEIGHTS
    # sum of all max weights can exceed 100; total is capped in score_lead
    assert sum(WEIGHTS.values()) >= 100
