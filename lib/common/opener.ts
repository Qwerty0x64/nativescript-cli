import xopen = require("open");
import { IOpener } from "../declarations";
import { injector } from "./yok";

export class Opener implements IOpener {
	public open(target: string, appname?: string): any {
		return xopen(target, appname);
	}
}
injector.register("opener", Opener);
