import prompts from "prompts";
import chalk from "chalk";
import { Logger } from "./logger.js";
import { getToken } from "./authHelper.js";
import { initConfigFile, readConfigFile, writeConfigFile } from "./configHelper.js";

export async function linkHelper() {
    Logger.info("Linking your GitHub repository to aerocloud...");

    // Step 1: Get the token from the config file
    const accessToken = getToken(true); // Returns only the token string
    const apiKey = (getToken(false) as any)?.apiKey; // Returns the full object, so we extract the apiKey

    if (!accessToken || !apiKey) {
        Logger.error("You must authenticate first. Please run 'aerocloud auth' to authenticate.");
        return;
    }

    // Step 2: Fetch the user's GitHub repositories using the GitHub API & linked projects lists from db
    const githubResponse = fetch("https://api.github.com/user/repos?sort=pushed&direction=desc&per_page=30", {
        method: "GET",
        headers: {
            "Authorization": `token ${accessToken}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "AeroCloud-CLI"
        }
    });

    const aerocloudResponse = fetch("http://localhost:3000/projects", {
        method: "GET",
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    });

    const [githubRepos, aerocloudProjects] = await Promise.all([githubResponse, aerocloudResponse]);

    if (!githubRepos.ok) {
        Logger.error("Failed to fetch GitHub repositories. Please check your access token.");
        return;
    }
    if (!aerocloudProjects.ok) {
        Logger.error("Failed to fetch linked projects from aerocloud. Please check your API key.");
        return;
    }

    const githubReposData = await githubRepos.json();
    const aerocloudProjectsData = await aerocloudProjects.json();

    // Step 3: Create a Set of linked repo full names for quick lookup & format choices
    const linkedRepoFullName = new Set(aerocloudProjectsData.map((project: any) => project.repoFullName));
    const validRepos = githubReposData.filter((repo: any) => !repo.fork);
    const maxNameLen = Math.max(...validRepos.map((r: any) => r.name.length), 20);
    
    const reposData = validRepos.map((repo: any) => {
        const isLinked = linkedRepoFullName.has(repo.full_name);
        const branchName = repo.default_branch || 'main';

        const nameStyled = isLinked
            ? chalk.dim.strikethrough(repo.name)
            : chalk.white.bold(repo.name);

        const paddedName = nameStyled + ' '.repeat(Math.max(1, (maxNameLen + 4) - repo.name.length));

        const branchStyled = isLinked
            ? chalk.dim(`${branchName}  (linked)`)
            : chalk.dim(branchName) + (repo.private ? chalk.yellow('  🔒 private') : '');

        return {
            title: `${paddedName} ${branchStyled}`,
            value: {
                name: repo.name,
                fullName: repo.full_name,
                branch: branchName,
                private: repo.private,
            },
            disabled: isLinked
        };
    });

    console.log();
    console.log(chalk.gray("┌─────────────────────────────────────────────────────────────┐"));
    console.log(chalk.gray("│") + chalk.bold.cyan("  AeroCloud ") + chalk.dim("› Link Repository                                ") + chalk.gray("│"));
    console.log(chalk.gray("│") + chalk.dim("  Select a GitHub repository to deploy with this folder      ") + chalk.gray("│"));
    console.log(chalk.gray("└─────────────────────────────────────────────────────────────┘"));
    console.log();

    // Step 4: Feed the repos to prompts for user selection
    const response = await prompts({
        type: 'autocomplete',
        name: 'selectedRepo',
        message: 'Search repository:',
        choices: reposData,
        limit: 10,
        suggest: (input, choices) =>
            Promise.resolve(choices.filter(choice => choice.value.name.toLowerCase().includes(input.toLowerCase())))
    });

    // Step 4.1: Handle the case where user cancels
    if (!response.selectedRepo) {
        Logger.warn("Repository linking cancelled.");
        return;
    }

    const selected = response.selectedRepo;

    // Step 5: Update local aerocloud.json
    initConfigFile();
    const currentConfig = readConfigFile() || {};
    writeConfigFile({
        ...currentConfig,
        name: currentConfig.name && currentConfig.name.trim() !== '' ? currentConfig.name : selected.name,
        repo: selected.fullName,
        branch: selected.branch
    });

    // Step 6: Sync link with AeroCloud Server Database
    try {
        const serverLinkResponse = await fetch("http://localhost:3000/projects/link", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                name: currentConfig.name && currentConfig.name.trim() !== '' ? currentConfig.name : selected.name,
                repoFullName: selected.fullName,
                branch: selected.branch
            })
        });

        if (serverLinkResponse.ok) {
            Logger.success(`Successfully linked directory to ${chalk.green.bold(selected.fullName)} (${chalk.cyan(selected.branch)})!`);
            Logger.info(`Local configuration saved to ${chalk.bold('aerocloud.json')}`);
        } else {
            const errData = await serverLinkResponse.json().catch(() => ({}));
            Logger.warn(`Local config saved, but server sync reported: ${errData.error || serverLinkResponse.statusText}`);
        }
    } catch (err) {
        Logger.warn(`Local config saved, but failed to reach server for remote link sync: ${(err as Error).message}`);
    }
}