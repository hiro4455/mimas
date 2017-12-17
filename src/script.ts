export namespace Script {

	/**
	 * スクリプトエラー
	 */
	export class FatalError implements Error {
		public name = "ScriptFatalError";
		public message = "";

		public constructor(message: string) {
			this.message = message;
		}

		public toString() {
			return this.name + ": " + this.message;
		}
	}

	/**
	 * コマンドのベースクラス
	 * 
	 * @description コマンドを実装するにはこのクラスを継承し、必要なメソッドを実装する。
	 * 
	 */
	export abstract class Command {

		/**
		 * コマンドが終了したか？
		 * 
		 * @returns true コマンドが終了した
		 */
		public abstract get isFinished(): boolean;

		/**
		 * コマンド実行直前に呼ばれる
		 * @inner
		 */
		public init(): void { }

		/**
		 * コマンド登録時に呼ばれる
		 * @param engine 自身が所属しているスクリプトエンジン
		 */
		public onRegistered(engine: Engine): void { }

		/**
		 * 実行を一旦停止するか？
		 * @returns true スクリプトの実行が一旦停止する
		 */
		public get isBreak(): boolean { return false; }

		/**
		 * コマンド開始時に呼び出される
		 * @param engine 自身が所属しているスクリプトエンジン
		 */
		public abstract start(engine: Engine): void;

		/**
		 * コマンド実行中に呼び出し続けられる
		 * @param engine 自身が所属しているスクリプトエンジン
		 */
		public abstract update(engine: Engine): void;

		/**
		 * コマンド終了時に呼び出される
		 * @param engine 自身が所属しているスクリプトエンジン
		 */
		public abstract finish(engine: Engine): void;
	}

	/**
	 * 実行後即終了するコマンド
	 * 
	 */
	export abstract class OneShotCommand extends Command {
		public get isFinished(): boolean { return true; }
		public update(engine: Engine): void { }
		public finish(engine: Engine): void { }
	}

	/**
	 * 継続して実行するコマンド(終了するまでスクリプトは先に進まない)
	 */
	export abstract class ContinuousCommand extends Command {
		private commandFinished: boolean = false;

		public get isFinished(): boolean {
			return this.commandFinished;
		}

		public stopCommand(): void {
			this.commandFinished = true;
		}

		public init(): void {
			this.commandFinished = false;
		}
	}

	/**
	 * スクリプト実行前の待ち状態(内部制御用)
	 */
	export class CommandReady extends OneShotCommand {
		public start(engine: Engine): void { /* なにもしない */ }
	}
	/**
	 *  スクリプト動作の停止(内部制御用)
	 */
	export class CommandHalt extends ContinuousCommand {
		public start(engine: Engine): void { /* なにもしない */ }
		public update(engine: Engine): void { /* なにもしない */ }
		public finish(engine: Engine): void { /* なにもしない */ }
	}

	/**
	 * ラベル定義用コマンド(内部制御用)
	 */
	export class CommandLabel extends OneShotCommand {
		public constructor(public name: string) { super(); }
		public start(engine: Engine): void { /* なにもしない */ }
	}


	export class Parser {
		public static parse(commandTable: any, script: string, filename: string): Array<Script.Command> {

			let commands: Array<Command> = new Array<Command>();
			let currentCommand: Array<any>;
			let p:number = 0;
			let state = "default";
			let stateStack = [];
			var index: number;
			var token: string;
			let line = 1;
			let debugLine = "";

			let skip_whitespace = (s:string, p:number): number => {
				while (" \t\r\n;,".indexOf(s[p]) >= 0) {
					if (s[p] === "\n") { line++; }
					p++;
				}
				return p;
			};

			while (p < script.length) {
				switch (state) {
					case "default":
						if (" \t\r\n;,".indexOf(script[p]) >= 0) {
							stateStack.push(state);
							state = "whitespace";
							break;
						}
						if (script.substr(p).indexOf("//") === 0) {
							stateStack.push(state);
							state = "singlelinecomment";
							break;
						}
						if (script[p].match(/[a-z]/i)) {
							stateStack.push(state);
							state = "function";
							break;
						}
						throw Error("スクリプトエラー:" + filename + ":" + line + " 構文が解釈できませんでした ");
					case "whitespace":
						p = skip_whitespace(script, p);
						state = stateStack.pop();
						break;
					case "singlelinecomment":
						while (script[p++] !== "\n") ;
						line++;
						state = stateStack.pop();
						break;
					case "function":
						p = skip_whitespace(script, p);
						if (script[p] === ")") {
							let commandName: any = currentCommand.shift();
							if (commandTable[commandName] === undefined) {
								throw Error("スクリプトエラー:" + filename + ":" + line + " 対応していないコマンドが指定されました(" + commandName + ") ");
							}
							commands.push(commandTable[commandName](currentCommand));
							p++;
							state = stateStack.pop();
							break;
						}
						index = script.indexOf("(", p);
						token = script.substr(p, index - p).trim();
						currentCommand = [token];
						p = index + 1;
						stateStack.push(state);
						state = "argument";
						break;
					case "argument":
						p = skip_whitespace(script, p);
						if (script[p] === ")") {
							state = stateStack.pop();
							break;
						}
						if (script[p] === "\"") {
							stateStack.push(state);
							state = "argument_string";
							break;
						}
						if ("-+.0123456789".indexOf(script[p]) >= 0) {
							stateStack.push(state);
							state = "argument_number";
							break;
						}
						throw new Error("スクリプトエラー:" + filename + ":" + line + " 引数の指定が想定外のフォーマットです");
					case "argument_string":
						p++;
						index = script.indexOf("\"", p);
						token = script.substr(p, index - p);
						currentCommand.push(token);
						p = index + 1;
						state = stateStack.pop();
						break;
					case "argument_number":
						index = p;
						while ("-+.0123456789".indexOf(script[index]) >= 0) index++;
						token = script.substr(p, index - p);
						currentCommand.push(parseFloat(token));
						p = index;
						state = stateStack.pop();
						break;
				}
			}
			return commands;
		}

	}

	export class Label {
		public static fullname(scriptName: string, labelName: string): string {
			return scriptName + "/" + labelName;
		}

		public static isFullname(name: string): boolean {
			return name.indexOf("/") > 0;
		}

		public constructor(public scriptName: string, public labelName: string, public index: number) {}
	}

	export class Value {

	}

	export class ValueContainer {
		private values: any;

		public constructor() {
			this.values = new Object;
		}

		public set(name: string, value: any): void {
			this.values[name] = value;
		}

		public get(name: string): void {
			return this.values[name];
		}
	}

	/**
	 * 単体のコマンドリスト
	 */
	class Sequence {
		private program: Array<Command>;

		public constructor(public scriptName: string) { }

		public register(commands: Array<Command>): void {
			if (this.program === undefined) {
				this.program = new Array<Command>();
			}
			commands.forEach((command: Command, index) => {
				this.program.push(command);
			});
		}

		public fetchCommand(index: number): Command {
			return this.program[index];
		}

		public get length(): number { return this.program.length; }

		public forEach(func: (c: Command, n: number) => {}): void {
			this.program.forEach((command: Command, index: number) => {
				func(command, index);
			});
		}
	}

	/**
	 * 単体のコマンドを実行するための処理
	 */
	class Player {
		private sequence: Sequence;
		private currentCommand: Command;
		private programCounter: number;

		public constructor(sequence: Sequence, index: number = 0) {
			this.reset(sequence, index);
		}

		public reset(sequence: Sequence, index: number = 0): void {
			this.sequence = sequence;
			this.programCounter = index - 1;
			this.currentCommand = new CommandReady();
		}

		public run(engine: Engine): void {
			while (this.currentCommand.isFinished) {
				this.programCounter++;
				if (this.sequence.length <= this.programCounter) {
					this.currentCommand = new CommandHalt();
					return;
				}
				this.currentCommand = this.sequence.fetchCommand(this.programCounter);
				this.currentCommand.init();
				this.currentCommand.start(engine);
				if (this.currentCommand.isBreak) {
					break;
				}
			}

			if (this.currentCommand.isFinished === false) {
				this.currentCommand.update(engine);
				if (this.currentCommand.isFinished) {
					this.currentCommand.finish(engine);
				}
			}
		}

		public get isHalted(): boolean {
			return this.currentCommand instanceof CommandHalt;
		}

		public get scriptName(): string {
			return this.sequence.scriptName;
		}
	}

	/**
	 * スクリプト実行エンジン
	 */
	export class Engine {
		private sequences: any;
		private player: Player;
		private currentScriptName: string;
		private callStack: Array<Player>;
		private labelTable: any;
		private valueContainer: ValueContainer;

		public constructor() {
			this.sequences = new Object();
			this.callStack = new Array<Player>();
			this.labelTable = new Object();
			this.valueContainer = new ValueContainer();
		}

		public register(commands: Array<Command>, scriptName: string = "default"): void {
			if (this.sequences[scriptName] === undefined) {
				this.sequences[scriptName] = new Sequence(scriptName);
			}
			if (this.player === undefined) {
				this.player = new Player(this.sequences[scriptName]);
			}

			this.sequences[scriptName].register(commands);

			this.sequences[scriptName].forEach((command: Command, index: number) => {
				if (command instanceof CommandLabel) {
					let label: CommandLabel = <CommandLabel>command;
					this.labelTable[Label.fullname(scriptName, label.name)] = new Label(scriptName, label.name, index);
				}
			});

			this.sequences[scriptName].forEach((command: Command, index: number) => {
				command.onRegistered(this);
			});
		}

		public setValue(valueName: string, value: any): void {
			this.valueContainer.set(valueName, value);
		}

		public getValue(valueName: string): any {
			return this.valueContainer.get(valueName);
		}

		public getLabel(labelName: string): Label {
			let labelFullName: string = labelName;
			if (Label.isFullname(labelName) === false) {
				labelFullName = Label.fullname(this.player.scriptName, labelName);
			}
			return this.labelTable[labelFullName];
		}

		public run(): void {
			this.player.run(this);
			if (this.player.isHalted && this.callStack.length > 0) {
				this.player = this.callStack.pop();
			}
		}

		public get isHalted(): boolean {
			return this.player.isHalted;
		}

		public goto(index: number, scriptName: string = "default"): void {
			this.player.reset(this.sequences[scriptName], index);
		}

		public gosub(index: number, scriptName: string = "default"): void {
			this.callStack.push(this.player);
			this.player = new Player(this.sequences[scriptName], index);
		}
	}
}
