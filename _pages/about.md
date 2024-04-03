---
permalink: /
title: "About Me"
author_profile: true
redirect_from: 
  - /about/
  - /about.html
---


I'm a **fifth-year Ph.D. student** in Computer Science at the University of Alabama at Birmingham (UAB), under the guidance of [Dr. Chengcui Zhang](https://sites.uab.edu/czhang02/). My research interests are focused on **Machine Learning**, **Large Vision-Language Foundation Models**, and **Parameter-Efficient Fine-Tuning (PEFT)**, with a focus on advancing Computer Vision and Natural Language Processing.

Before initiating my Ph.D. in 2019, my journey began at the North University of China, where I earned my B.E. and M.E. degrees (2006-2013) and was an exchange graduate student at Tsinghua University (2011-2013). I then applied machine learning in industry for **6 years** （2013-2019, progressing from **Senior to Principal Engineer**, which sharpened my skills in tackling real-world challenges.

Driven by a passion for technology and knowledge, my work has resulted in **11 esteemed publications**. Throughout my Ph.D., roles as a Graduate Teaching Assistant and Research Assistant have further developed my leadership and collaboration skills, equipping me to make significant contributions to both academia and industry.

Explore my projects, publications, and more on my [LinkedIn](https://www.linkedin.com/in/fei-zhao-6a762724a/).



## Selected Publications
<!-- ====== -->

**Published**

1. **Fei Zhao**, Chengcui Zhang, and Baocheng Geng, "Deep Multimodal Data Fusion," *ACM Computing Surveys*, February 2024. [Impact Factor: 16.6]

2. Connor Donley, Matthew McCrosson, Sri Prahad, Collier Campbell, **Fei Zhao**, Narcy Amireddy, and Michael Johnson, "High Research Productivity During Orthopaedic Surgery Residency May Be Predicted by Number of Publications as a Medical Student," *Journal of Bone and Joint Surgery*, January 30, 2024. [Impact Factor: 5.3]

3. **Fei Zhao** and Chengcui Zhang, "Deep Learning for HABs Prediction with Multimodal Fusion," ACM SIGSPATIAL International Conference on Advances in Geographic Information Systems (ACM SIGSPATIAL 2023), November 13-16, 2023, Hamburg, Germany.

4. **Fei Zhao**, Chengcui Zhang, Nitesh Saxena, Dan Wallach, and Shahariar Rabby, "Ballot Tabulation using Deep Learning," IEEE International Conference on Information Reuse and Integration (IRI), August 4-6, 2023, Bellevue, WA, United States. [Acceptance Rate of Full Papers: 29%]

5. **Fei Zhao**, Chengcui Zhang, and Sheikh Abujar, "A Multimodal Approach for Evaluating Algal Bloom Severity using Deep Learning," IEEE International Conference on Multimedia and Expo (ICME), July 10-14, 2023, Brisbane, Australia.

6. Katherine Dudding, Allyson Sanders, Peyton Lewis, **Fei Zhao**, Chengcui Zhang, and Jane Carrington, "Leveraging Clinical Experiences to Inform Optimal Neonatal Outcomes Through Technology," Academy of Neonatal Nursing National Neonatal, Advanced Practice Conference, and Mother Baby Nurses Conferences, September 7-10, 2022, Palm Springs, CA, United States. (Poster)

7. **Fei Zhao** and Chengcui Zhang, "Building Damage Evaluation from Satellite Imagery using Deep Learning," IEEE International Conference on Information Reuse and Integration (IRI), August 11-13, 2020, held virtually. [Acceptance Rate of Full Papers: 29%]

8. **Fei Zhao**, Zhaoying Zhou, Jijun Xiong, Jifeng Zhao, and Jiajin Liu, "Research on MEMS-based Real-Time Measurement System for Motion Information of Vehicles," *Key Engineering Materials*, 562, 549-552, 2013.

9. Xiaotang Cao, Yunbo Shi, Zhaoying Zhou, Shaopeng Liu, Qi Guo, **Fei Zhao**, "MEMS-based Attitude Measurement System for Micro Aerial Vehicles," *Transducer and Microsystem Technologies*, 32(2), 122-3, 2013.

**Under Review**

- **Fei Zhao**, Chengcui Zhang, and Nitesh Saxena, "BubbleSig: Same-Hand Ballot Stuffing Detection." The 33rd USENIX Security Symposium.

- **Fei Zhao**, Chengcui Zhang, and Katherine Dudding, "Neonatal Pain Detection using Deep Learning." Journal of Healthcare Informatics Research.

**Pre-prints**

- **Fei Zhao** and Chengcui Zhang, "Visual Prompt Learning of Foundation Models for Post-disaster Damage Assessment." Manuscript ready for submission.

- **Fei Zhao** and Chengcui Zhang, "Parameter-Efficient Adapation of Vision Foundation Models for Building Damage Evaluation." Manuscript ready for submission.

- **Fei Zhao** and Chengcui Zhang, "Multimodal Algal Bloom Severity Evaluation Using Deep Learning: Leveraging Satellite Imagery, Elevation, Temperature, and Geolocation Data." Manuscript ready for submission.

- "Augmented Communication Tools (ACTs): Pain Assessment Support Algorithm for the Individual Infant (PASAFii) for the neonatal pain algorithm." Provisional Patent.





A data-driven personal website
======
Like many other Jekyll-based GitHub Pages templates, academicpages makes you separate the website's content from its form. The content & metadata of your website are in structured markdown files, while various other files constitute the theme, specifying how to transform that content & metadata into HTML pages. You keep these various markdown (.md), YAML (.yml), HTML, and CSS files in a public GitHub repository. Each time you commit and push an update to the repository, the [GitHub pages](https://pages.github.com/) service creates static HTML pages based on these files, which are hosted on GitHub's servers free of charge.

Many of the features of dynamic content management systems (like Wordpress) can be achieved in this fashion, using a fraction of the computational resources and with far less vulnerability to hacking and DDoSing. You can also modify the theme to your heart's content without touching the content of your site. If you get to a point where you've broken something in Jekyll/HTML/CSS beyond repair, your markdown files describing your talks, publications, etc. are safe. You can rollback the changes or even delete the repository and start over -- just be sure to save the markdown files! Finally, you can also write scripts that process the structured data on the site, such as [this one](https://github.com/academicpages/academicpages.github.io/blob/master/talkmap.ipynb) that analyzes metadata in pages about talks to display [a map of every location you've given a talk](https://academicpages.github.io/talkmap.html).

Getting started
======
1. Register a GitHub account if you don't have one and confirm your e-mail (required!)
1. Fork [this repository](https://github.com/academicpages/academicpages.github.io) by clicking the "fork" button in the top right. 
1. Go to the repository's settings (rightmost item in the tabs that start with "Code", should be below "Unwatch"). Rename the repository "[your GitHub username].github.io", which will also be your website's URL.
1. Set site-wide configuration and create content & metadata (see below -- also see [this set of diffs](http://archive.is/3TPas) showing what files were changed to set up [an example site](https://getorg-testacct.github.io) for a user with the username "getorg-testacct")
1. Upload any files (like PDFs, .zip files, etc.) to the files/ directory. They will appear at https://[your GitHub username].github.io/files/example.pdf.  
1. Check status by going to the repository settings, in the "GitHub pages" section

Site-wide configuration
------
The main configuration file for the site is in the base directory in [_config.yml](https://github.com/academicpages/academicpages.github.io/blob/master/_config.yml), which defines the content in the sidebars and other site-wide features. You will need to replace the default variables with ones about yourself and your site's github repository. The configuration file for the top menu is in [_data/navigation.yml](https://github.com/academicpages/academicpages.github.io/blob/master/_data/navigation.yml). For example, if you don't have a portfolio or blog posts, you can remove those items from that navigation.yml file to remove them from the header. 

Create content & metadata
------
For site content, there is one markdown file for each type of content, which are stored in directories like _publications, _talks, _posts, _teaching, or _pages. For example, each talk is a markdown file in the [_talks directory](https://github.com/academicpages/academicpages.github.io/tree/master/_talks). At the top of each markdown file is structured data in YAML about the talk, which the theme will parse to do lots of cool stuff. The same structured data about a talk is used to generate the list of talks on the [Talks page](https://academicpages.github.io/talks), each [individual page](https://academicpages.github.io/talks/2012-03-01-talk-1) for specific talks, the talks section for the [CV page](https://academicpages.github.io/cv), and the [map of places you've given a talk](https://academicpages.github.io/talkmap.html) (if you run this [python file](https://github.com/academicpages/academicpages.github.io/blob/master/talkmap.py) or [Jupyter notebook](https://github.com/academicpages/academicpages.github.io/blob/master/talkmap.ipynb), which creates the HTML for the map based on the contents of the _talks directory).

**Markdown generator**

I have also created [a set of Jupyter notebooks](https://github.com/academicpages/academicpages.github.io/tree/master/markdown_generator
) that converts a CSV containing structured data about talks or presentations into individual markdown files that will be properly formatted for the academicpages template. The sample CSVs in that directory are the ones I used to create my own personal website at stuartgeiger.com. My usual workflow is that I keep a spreadsheet of my publications and talks, then run the code in these notebooks to generate the markdown files, then commit and push them to the GitHub repository.

How to edit your site's GitHub repository
------
Many people use a git client to create files on their local computer and then push them to GitHub's servers. If you are not familiar with git, you can directly edit these configuration and markdown files directly in the github.com interface. Navigate to a file (like [this one](https://github.com/academicpages/academicpages.github.io/blob/master/_talks/2012-03-01-talk-1.md) and click the pencil icon in the top right of the content preview (to the right of the "Raw | Blame | History" buttons). You can delete a file by clicking the trashcan icon to the right of the pencil icon. You can also create new files or upload files by navigating to a directory and clicking the "Create new file" or "Upload files" buttons. 

Example: editing a markdown file for a talk
![Editing a markdown file for a talk](/images/editing-talk.png)

For more info
------
More info about configuring academicpages can be found in [the guide](https://academicpages.github.io/markdown/). The [guides for the Minimal Mistakes theme](https://mmistakes.github.io/minimal-mistakes/docs/configuration/) (which this theme was forked from) might also be helpful.
