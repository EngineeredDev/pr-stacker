# 🥞 pr-stacker-bot

> A GitHub App for easy and efficient folding of stacked PR's on Github.

Stacked PR's are awesome, but Github limitations do not make it easy on the CI/CD process. 

For example, most repositories will want to require a pull request before merging and will need to choose what merge methods to allow.

![image](https://github.com/user-attachments/assets/1613f276-7e8d-45ae-9a6c-50a9d728840c)

It is often desired to only the "Squash" method. "Rebase" is asking for a terrible commit history, and the "Merge" commit is often undesirable as well.

Okay so we only want squash; this leaves stacked PR's in a tough spot. In order to preserve the individual PR commit history, you need to merge each PR into the trunk one by one, continually restacking them after each merge. If you have a lengthy CI validation process, this quickly becomes extremely tedious and also potentially expensive. (CI minutes don't grow on trees ya know!)

The other option is to "fold" each PR into the one below it, and then squash the whole changeset in the final remaining PR and merge that into your trunk. This stinks! You lose your commit history, and now your entire changeset will only point to this one PR. All that hard work lost to the annals of time!

Enter `pr-stacker-bot`!

When you are ready to merge a stack of PR's, just comment `/stackbot fold` on a pull request, and it will fold that PR and all below it in the stack into the trunk branch. 

The way it works is that it will first squash each PR into one commit, setting the commit message to the PR title and body. Then it takes each commit and puts it on a temporary branch, and finally rebasing the squashed commits onto your trunk branch. It does this operation iteratively, one by one, so that Github will correctly mark each individual PR as "merged" automatically. All changeset history will be properly preserved, and you can go back and view the Pull Requests in the future and get an accurate representation of what each commit/PR changed. Beautiful!

The only real downside is that each PR will have a base that points to a temporary branch.

## Setup

A hosted version of this bot is made available [here](https://github.com/apps/pr-stacker). Add the app to your repository/organization and allow the requested permissions.

Then go ahead and add the `pr-stacker` app to the bypass list of your branch protection rule (if you have one) that enforces requiring a pull request, or any other enforcement rules that may prevent it such as "Block force pushes" or "Require merge queue". That should be it!

## Self Hosted

If you don't trust the hosted version and would rather host your own, that is also possible! You can either clone the repo directly, or use the built [Docker images](https://github.com/EngineeredDev/pr-stacker/pkgs/container/pr-stacker)

You will need to set the following environment variables:
* `APP_ID`
* `PRIVATE_KEY`
* `WEBHOOK_SECRET`
* `GITHUB_CLIENT_ID`
* `GITHUB_CLIENT_SECRET`

To learn more about these, you can reference either the [probot documentation](https://probot.github.io/docs/development/#manually-configuring-a-github-app) or the [Github documentation](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/quickstart)

To run locally, setup a `.env` file with the necessary values, and then it is as simple as:

```sh
npm install
npm run start
```

## Contributing

If you have suggestions for pr-stacker could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2025 EngineeredDev
