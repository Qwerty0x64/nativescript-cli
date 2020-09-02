import { IProjectData } from "../definitions/project";
import { IMigrateController } from "../definitions/migrate";
import { ICommand, ICommandParameter } from "../common/definitions/commands";
import { injector } from "../common/yok";

export class MigrateCommand implements ICommand {
	public allowedParameters: ICommandParameter[] = [];

	constructor(
		private $devicePlatformsConstants: Mobile.IDevicePlatformsConstants,
		private $migrateController: IMigrateController,
		private $projectData: IProjectData,
		private $logger: ILogger
	) {
		this.$projectData.initializeProjectData();
	}

	public async execute(args: string[]): Promise<void> {
		const shouldMigrateResult = await this.$migrateController.shouldMigrate({
			projectDir: this.$projectData.projectDir,
			platforms: [
				this.$devicePlatformsConstants.Android,
				this.$devicePlatformsConstants.iOS,
			],
		});

		if (!shouldMigrateResult) {
			this.$logger.printMarkdown(
				'__Project is compatible with NativeScript "v7.0.0". To get the latest NativeScript packages execute "ns update".__'
			);
			return;
		}

		await this.$migrateController.migrate({
			projectDir: this.$projectData.projectDir,
			platforms: [
				this.$devicePlatformsConstants.Android,
				this.$devicePlatformsConstants.iOS,
			],
		});
	}
}

injector.registerCommand("migrate", MigrateCommand);
