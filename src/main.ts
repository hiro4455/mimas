import {Sub} from "./sub";
import {Script} from "./script";
import {Command} from "./commands";

import "source-map-support/register";

//Sub.hello();

let script = new Script.Engine();
let commands = [
    new Command.Log("Hello"),
    new Script.CommandHalt()
]
script.register(commands);
script.run();
