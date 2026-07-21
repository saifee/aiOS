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
