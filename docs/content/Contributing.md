---
title: Contributing
---

# Contributing to these docs

We are using [nuxt content](https://content.nuxt.com/) + [Docus](https://docus.dev/) to generate these docs.

All the config to generate the site lives in the [docs](https://github.com/CodeWithCJ/SparkyFitness/tree/main/docs) folder, and the pages themself live in [docs/content](https://github.com/CodeWithCJ/SparkyFitness/tree/main/docs/content). To update any of these pages simple fork this repository, and update the files in the docs/content folder and submit a PR for approval to get your updates showing.

## Quick Edits
To edit a file quickly you can just edit the markdown file on GitHub, it will prompt you to fork, commit and create a PR etc.

## Large Edits
If you would like to make some major edits you can follow the below steps to preview your changes locally. This assumes you have some basic GH knowledge.

* Fork the repository
* Clone your fork locally
* Create a new branch
* Run the following commands to get it running locally

    * `cd docs`
    * `npm i`
    * `npm run dev`
    * Click link to open `http://localhost:3000`
* You can now run the docs locally. Make any changes you want to the markdown files, and as you save it will refresh to preview your new content.
* Add and Commit your changes, and push up to your fork.
* Create a PR from your feature branch to the main branch.


## Icons
To add an icon to a folder, you can create a `_dir.yml` file in the folder and find an icon from [icones.js.org](https://icones.js.org/) See existing folders for formating