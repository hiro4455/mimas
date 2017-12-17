import {Script} from "./script";

export namespace Command {
    export class Log extends Script.OneShotCommand {
        public constructor(public message: string) {
            super();
        }
        public start(engine: Script.Engine): void {
            console.log(this.message);
        }
    }
}