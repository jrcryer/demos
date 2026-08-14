# Contributing

Thanks for your interest in contributing. Please read through this document
before submitting any issues or pull requests.

## Reporting bugs and feature requests

Use the GitHub issue tracker. Before filing, please search existing issues to
make sure it has not already been reported. When filing a bug, include:

- A reproducible test case or series of steps
- The version of the code being used
- Anything unusual about your environment or deployment

## Contributing via pull requests

1. Fork the repository and work against the latest `main`.
2. Make your change, keeping the diff focused on a single concern.
3. Ensure the checks pass locally:

   ```bash
   npm ci
   npm run lint
   npm test
   npx cdk synth
   ```

4. Commit using clear commit messages and open a pull request describing the
   change and the motivation behind it.

## Code of conduct

This project has adopted the
[Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).

## Security issue notifications

If you discover a potential security issue in this project, please notify AWS
Security via our
[vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/).
Please do **not** create a public GitHub issue.

## Licensing

See the [LICENSE](LICENSE) file. We will ask you to confirm the licensing of
your contribution.
