import { IInfoService, IVersionsService } from "../declarations";
import { injector } from "../common/yok";

export class InfoService implements IInfoService {
	constructor(private $versionsService: IVersionsService) {}

	public printComponentsInfo(): Promise<void> {
		return this.$versionsService.printVersionsInformation();
	}
}

injector.register("infoService", InfoService);
