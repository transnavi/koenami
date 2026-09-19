---
type: source
key: simon2026
title: "Validation of an AI-assisted Treatment Outcome Measure for Gender-Affirming Voice Care: Comparing AI Accuracy to Listener's Perception of Voice Femininity"
authors: [Simon S, Silverstein E, "Timmons-Sund L", Pinto JM, Castro ME, "O'Dell K", "Johns III MM", Mack WJ, Bensoussan Y]
year: 2026
venue: Journal of Voice 40(3) 614–623
doi: 10.1016/j.jvoice.2023.12.008
url: https://doi.org/10.1016/j.jvoice.2023.12.008
language: en
kind: validation-study
evidence: medium
verified: pubmed abstract (PMID 38158296) 2026-09-17
topics: ["[[machine-gender-scoring]]", "[[gender-perception]]", "[[patient-reported-outcomes]]", "[[tools]]"]
---

# Validation of an AI-assisted Treatment Outcome Measure for Gender-Affirming Voice Care

## What it says
- 100 recordings from 50 cisgender men and 50 cisgender women attending a university voice clinic for reasons other than dysphonia, rated by expert and naïve human listeners on how sure they were the voice belonged to a female speaker ("% voice femininity") (abstract, "Methods").
- Two AI models were compared against them: one trained on a high-quality low-quantity set (Perceptual Voice Quality Database, "PVQD model") and one on a low-quality high-quantity set (Mozilla Common Voice, "Mozilla model"). Ambiguity scores were computed as the absolute difference between rating and certainty.
- "Both expert and naïve listeners achieved 100% accuracy in identifying voice gender based on a binary classification"; the Mozilla-trained model reached 92% and the PVQD model 84%.
- Both models correlated with human ratings, "the Mozilla-trained model showed a stronger correlation as well as lower overall rating ambiguity"; it "also appeared to handle pitch information in a similar way to human raters".
- Conclusion: for binary classification, "the quantity of data may influence accuracy more than the quality of the data used for training".

## Bearing on voice training
- The benchmark for automatic femininity scoring against human listeners: a binary male/female decision on clear cisgender voices is close to solved (92% vs 100%), which is the easy case [[machine-gender-scoring]] [[tools]].
- Read the caveats before using it as an outcome measure: the validation set is 100 cisgender voices attending a clinic for other reasons — not trans voices, not the ambiguous middle of the range where training works, and no separate male/female/gender-diverse judgement [[gender-perception]] [[patient-reported-outcomes]].

## Notes
- Retrospective, single centre (USC, with a Montreal AI institute co-author); the model itself is the team's own and no external validation cohort is reported. The abstract does not report accuracy on cisgender-ambiguous or trans speakers' voices.
- Claims taken from the PubMed abstract (J Voice 2026 May;40(3); Epub 2023 Dec 29).
