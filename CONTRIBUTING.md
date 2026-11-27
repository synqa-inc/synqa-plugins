# Contributing a plugin

This repository is the plugin catalog that the Synqa Marketplace in Synqa Labs reads. You can propose a plugin by pull request.

## What we accept at first

Only code-free plugins. That means themes, icon sets and languages. A plugin may contain JSON, images and text. Nothing in it may run or load code.

Allowed file types: `.json`, `.md`, `.txt`, `.png`, `.jpg`, `.webp` and `.svg`. An SVG must have no script tags and no links to other sites. Each file must be under 1 MB. A whole plugin must be under 5 MB.

## Files every plugin needs

Put your plugin in its own folder, `plugins/<id>/`. The folder name is the plugin id. Use lowercase letters, digits and hyphens.

- `synqa-plugin.json`: the plugin file. It must have `id`, `name`, `version` and `publisher`.
- `LICENSE`: the license of your plugin.
- `NOTICE`: names every author and every source you used, with their licenses.

Names and ids that start with `synqa` belong only to the publisher `synqa-inc`. Pick another name.

## The `listed.json` entry

Add your plugin to `listed.json` in the same pull request:

```json
{
  "version": 1,
  "plugins": [
    {
      "id": "my-theme",
      "publisher": "my-name",
      "path": "plugins/my-theme",
      "version": "1.0.0",
      "reviewer": "pending",
      "date": "2026-01-31"
    }
  ]
}
```

The `id`, `publisher` and `version` must match your `synqa-plugin.json`. The `path` is always `plugins/<id>`. Write `pending` for `reviewer`. A Synqa reviewer replaces it with their name when they approve the plugin.

## How a pull request goes

1. Fork this repository and make a branch.
2. Add your folder and your `listed.json` entry.
3. Sign off every commit (see below).
4. Open a pull request. An automatic check runs on it. Fix anything it reports.
5. A Synqa reviewer reads your plugin. They may ask for changes.
6. After the reviewer approves, the plugin is merged and shows up in the marketplace.

Nothing is merged without review.

## Sign-off

Every commit must carry a `Signed-off-by:` line. Add it with `git commit -s`.

> **Draft wording. A lawyer will review this text before it is final.**
>
> By adding a `Signed-off-by:` line, you state that you wrote the plugin or have the right to submit it, and that you agree Synqa may copy and redistribute the plugin, unchanged, under the license in its `LICENSE` file.

## Updates

To update a plugin, change its folder and raise `version` in both `synqa-plugin.json` and `listed.json`. Open a pull request. It is reviewed like a new plugin.

A plugin id and its publisher never change once people have installed it.

## Removal

To remove a plugin, open a pull request that deletes its folder and its `listed.json` entry. Synqa may also remove a plugin that breaks these rules, or that has a security problem. To report a problem, see `SECURITY.md`.
