# Privacy Policy

Last updated: 2026-07-30

This policy describes the data and network behavior of the open-source SkillHub desktop application.

## Summary

SkillHub does not operate an analytics, advertising, account, synchronization, or developer-controlled telemetry service. The application is designed to keep its catalog and activity data on the user's computer.

Optional features can communicate with third-party services as described below.

## Locally stored data

SkillHub stores application data under:

```text
%USERPROFILE%\.skillhub
```

Local data can include:

- scanned skill metadata and source paths
- categories, tags, favorites, and risk labels
- search history and recently viewed skills
- categorization history
- execution audit records
- language, theme, and application preferences
- the DeepSeek API key entered by the user

The DeepSeek API key is currently stored in plain text in the local `settings.json` file. Users must protect their Windows account and must not share this file. The key is not included intentionally in SkillHub's skill exports, logs, release artifacts, or repository.

## Directory scanning

SkillHub reads directories selected or configured by the user to discover `SKILL.md` files and related metadata. It does not upload scanned files to a SkillHub-operated service.

The application has filesystem capabilities for locations needed by its current desktop workflows. Users should select only directories they intend SkillHub to inspect.

## DeepSeek API

AI-assisted categorization is optional and runs only after the user configures an API key and starts categorization.

For this feature, SkillHub sends the following data to:

```text
https://api.deepseek.com/v1/chat/completions
```

- skill name
- skill description
- categorization instructions
- the user's DeepSeek API credential in the authorization header

DeepSeek processes this data under its own [privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html). Users should not submit confidential skill names or descriptions unless they accept DeepSeek's policies.

## Application updates

When the user checks for or downloads an update, SkillHub contacts GitHub Releases through the endpoint configured in the application. GitHub can receive ordinary connection information such as IP address, request time, and user-agent information under [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

Downloaded updates must pass the Tauri updater signature check before installation.

## Remote icons

A skill can contain an `http` or `https` icon URL. When that skill is displayed, the application WebView can request the remote image. The remote server can receive ordinary connection information such as the user's IP address and request headers.

Users who do not trust a remote icon host should remove or replace that URL in the source skill metadata.

## Skill execution

SkillHub can execute only an explicitly declared and user-confirmed command that passes its backend policy. Executed programs are independent software and can have their own data and network behavior. Users must review the execution preview and the source skill before confirming.

SkillHub records a sanitized local execution audit result. It does not intentionally store command arguments, environment variables, API keys, or private filesystem paths in that audit record.

## Exports

User-requested exports can contain skill names, descriptions, categories, tags, source information, and optionally source paths. Users control where exported files are saved and are responsible for reviewing them before sharing.

## Data deletion

Uninstalling the application does not intentionally delete `%USERPROFILE%\.skillhub`.

To remove SkillHub's local data, first close the application, make any required backup, and then delete that directory manually. This action cannot be undone.

## Changes

Material privacy changes will be documented in this file and in the relevant release notes.

## Contact

Privacy questions and non-sensitive bug reports can be opened through [GitHub Issues](https://github.com/yyr-465/SkillHubs/issues). Never include credentials or private data in a public issue.
