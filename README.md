# 🥞 pr-stacker

> What are stacked PR's? Learn more at [stacking.dev](https://www.stacking.dev/)

Stacked PR's are awesome! But Github limitations do not make life easy on the CI/CD process for stackers.

Most repositories are going to require a pull request before merging, and enforcing that means choosing what merge methods will be allowed.

![image](https://github.com/user-attachments/assets/1613f276-7e8d-45ae-9a6c-50a9d728840c)

The sane and often desired approach is to only allow the "Squash" method. "Rebase" is asking for a terrible commit history, and the "Merge" commit is a hot topic of debate we won't get into here.

Okay so we only want squash; this now leaves stacked PR's in a tough spot. In order to preserve each PR's commit history, you need to merge each PR into the trunk one by one, continually restacking upstack PR's after each merge. If you have a lengthy CI validation process, this quickly becomes extremely tedious and also expensive. (CI minutes don't grow on trees ya know!)

The other option is to "fold" each PR into the one below it and then squash the whole changeset from the final remaining PR into your trunk. This stinks! You lose your commit history, and now your entire changeset will only point to this one PR. All that hard work lost to the Github Gods!

### Enter `pr-stacker-bot`!

When you are ready to merge a stack of PR's, just comment `/stackbot fold` on a pull request, and the bot will fold that PR and all those below it into the trunk branch. 

The way it works is that it first squashes each PR into one commit, setting the commit message to the PR title and body. 

Then it takes each squashed commit and puts it on a temporary branch, and then rebasing the latest state of that temporary branch onto the trunk branch. 

The bot does this operation iteratively, one by one, so that Github will correctly mark each individual PR as "merged" automatically. All changeset history is properly preserved! You can go back and view the original PR's to see an accurate representation of what each commit/PR changed. Beautiful!

The only real downside is that each PR will have a base that points to a temporary branch.

A helpful comment with the representation of the full PR stack is added to each PR and updated as needed automatically.

By default, the bot will not fold the stack if any PR that would be folded is not ready to merge because of any CI checks that it might have failed (or are still running).

## Setup

A hosted version of this bot is made available [here](https://github.com/apps/pr-stacker). Add the app to your repository/organization and allow the requested permissions.

Then go ahead and add the `pr-stacker` app to the bypass list of your branch protection rule (if you have one) that enforces requiring a pull request, or any other enforcement rules that may prevent it such as "Block force pushes" or "Require merge queue". That should be it!

## Available Commands

- `/stackbot fold`: Squash and fold from the current PR down
- `/stackbot squash`: Squash each PR from the current PR down
- `/stackbot help`: Receive a comment with the available commands

## Configuration

Add a `.github/pr-stacker.yml` file in your repo where you can provider certain settings:

- `mainBranch`: (default: repo default branch) Set this to override the "trunk" to any other branch.
- `restrictCommandsToOriginator`: (default: `true`) Only the creator of the PR can initiate `stackbot` commands. Set this to false if you want to let anyone perform `stackbot` commands.
- `singleComment`: (default: `false`) Each action will generate a separate comment by default. Set this to `true` if you prefer there to only ever be 1 comment per PR, that continually gets edited if multiple commands are performed.
- `skipReadyCheck`: (default: `false`) If for some reason you want to be able to fold PR's that haven't passed CI or are otherwise not ready, you can set this config value to `true`.
- `stackTreeComment`: A config object for the comment that is added with the tree representation of the stack.
  - `enable`: (default: `true`)
  - `skipSinglePR`: (default: `true`) Comments will only be added to PR's that are at least part of a stack of 2. If you just want to add comments to every PR no matter what, you may set this to `false`. 

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
