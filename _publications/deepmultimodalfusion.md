---
title: "Deep Multimodal Data Fusion"
collection: publications
permalink: /publication/deepmultimodalfusion
authors:  <strong>Fei Zhao<strong>, Chengcui Zhang, and Baocheng Geng
excerpt: 'This paper is about the number 1. The number 2 is left for future work.'
year: 2024
date: 2024-01-31  # Also make sure the date format is correct
venue: 'ACM Computing Surveys (<strong>CSUR</strong>)'
paperurl: '/files/deepmultimodalfusion.pdf'
header:
---

Vulnerability of 3D point cloud (PC) classifiers has become a grave concern due to the popularity of 3D sensors in safety-critical applications. Existing adversarial attacks against 3D PC classifiers are all test-time evasion (TTE) attacks that aim to induce test-time misclassifications using knowledge of the classifier. But since the victim classifier is usually not accessible to the attacker, the threat is largely diminished in practice, as PC TTEs typically have poor transferability. Here, we propose the first backdoor attack (BA) against PC classifiers. Originally proposed for images, BAs poison the victim classifier's training set so that the classifier learns to decide to the attacker's target class whenever the attacker's backdoor pattern is present in a given input sample. Significantly, BAs do not require knowledge of the victim classifier. Different from image BAs, we propose to insert a cluster of points into a PC as a robust backdoor pattern customized for 3D PCs. Such clusters are also consistent with a physical attack (i.e., with a captured object in a scene). We optimize the cluster's location using an independently trained surrogate classifier and choose the cluster's local geometry to evade possible PC preprocessing and PC anomaly detectors (ADs). Experimentally, our BA achieves a uniformly high success rate (> 87%) and shows evasiveness against state-of-the-art PC ADs.