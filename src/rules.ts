import {
  getExactDisabledRuleValue,
  getYAMLText,
  QuoteCharacter,
} from './utils/yaml';
import {
  Option,
  BooleanOption,
} from './option';
import {YAMLException} from 'js-yaml';
import {LinterError} from './linter-error';
import {
  NormalArrayFormats,
  SpecialArrayFormats,
  TagSpecificArrayFormats,
} from './utils/yaml';
import {getTextInLanguage, LanguageStringKey} from './lang/helpers';
import {ignoreListOfTypes, IgnoreType} from './utils/ignore-types';
import {LinterSettings} from './settings-data';

// CommonStyles are settings that are used in multiple places and thus need to be external to rules themselves to help facilitate their use
export type CommonStyles = {
  aliasArrayStyle: NormalArrayFormats | SpecialArrayFormats;
  tagArrayStyle: TagSpecificArrayFormats | NormalArrayFormats | SpecialArrayFormats;
  minimumNumberOfDollarSignsToBeAMathBlock: number;
  escapeCharacter: QuoteCharacter;
  removeUnnecessaryEscapeCharsForMultiLineArrays: boolean;
}

export type Options = { [optionName: string]: any};

type ApplyFunction = (text: string, options?: Options) => string;

export enum RuleType {
  YAML = 'YAML',
  HEADING = 'Heading',
  FOOTNOTE = 'Footnote',
  CONTENT = 'Content',
  SPACING = 'Spacing',
  PASTE = 'Paste',
}

/** Class representing a rule */
export class Rule {
  /**
   * Create a rule
   * @param {LanguageStringKey} nameKey - The name key of the rule
   * @param {LanguageStringKey} descriptionKey - The description key of the rule
   * @param {string} settingsKey - The settings key of the rule
   * @param {string} alias - The alias of the rule which also is the config key for the rule
   * @param {RuleType} type - The type of the rule
   * @param {ApplyFunction} applyAfterIgnore - The function to apply the rule once everything has been ignored
   * @param {Array<Example>} examples - The examples to be displayed in the documentation
   * @param {Array<Option>} [options=[]] - The options of the rule to be displayed in the documentation
   * @param {boolean} [hasSpecialExecutionOrder=false] - The rule has special execution order
   * @param {IgnoreType[]} [ignoreTypes=[]] - The types of elements to ignore for the rule
   */
  constructor(
      private nameKey: LanguageStringKey,
      private descriptionKey: LanguageStringKey,
      public settingsKey: string,
      public alias: string,
      public type: RuleType,
      public applyAfterIgnore: ApplyFunction,
      public examples: Array<Example>,
      public options: Array<Option> = [],
      public readonly hasSpecialExecutionOrder: boolean = false,
      public readonly ignoreTypes: IgnoreType[] = [],
  ) {
    options.unshift(new BooleanOption('enabled', this.descriptionKey, '' as LanguageStringKey, false));
    for (const option of options) {
      option.ruleAlias = alias;
    }
  }

  public getDefaultOptions() {
    const options: { [optionName: string]: any } = {};

    for (const option of this.options) {
      options[option.configKey] = option.defaultValue;
    }

    return options;
  }

  public getOptions(settings: LinterSettings) {
    return settings.ruleConfigs[this.settingsKey];
  }

  public getName(): string {
    return getTextInLanguage(this.nameKey);
  }

  public getDescription(): string {
    return getTextInLanguage(this.descriptionKey);
  }

  public getURL(): string {
    const url =
      'https://github.com/platers/obsidian-linter/blob/master/docs/rules.md';
    return url + '#' + this.alias;
  }

  public enabledOptionName(): string {
    return this.options[0].configKey;
  }

  public apply(text: string, options?: Options): string {
    return ignoreListOfTypes(this.ignoreTypes, text, (textAfterIgnore: string) => {
      return this.applyAfterIgnore(textAfterIgnore, options);
    });
  }
}

/** Class representing an example of a rule */
export class Example {
  public description: string;
  public options: Options;

  public before: string;
  public after: string;

  /**
   * Create an example
   * @param {string} description - The description of the example
   * @param {string} before - The text before the rule is applied
   * @param {string} after - The text after the rule is applied
   * @param {object} options - The options of the example
   */
  constructor(
      description: string,
      before: string,
      after: string,
      options: Options = {},
  ) {
    this.description = description;
    this.options = options;
    this.before = before;
    this.after = after;
  }
}

export const RuleTypeOrder = Object.values(RuleType);

/**
 * Returns a list of ignored rules in the YAML frontmatter of the text.
 * @param {string} text The text to parse
 * @return {[string[], boolean]} The list of ignored rules and whether the current file should be ignored entirely
 */
export function getDisabledRules(text: string): [string[], boolean] {
  const yaml_text = getYAMLText(text);
  if (yaml_text === null) {
    return [[], false];
  }

  const disabled_rules = getExactDisabledRuleValue(yaml_text);

  if (disabled_rules.includes('all')) {
    return [rules.map((rule) => rule.alias), true];
  }

  return [disabled_rules, false];
}

export const rules: Rule[] = [];

export const rulesDict = {} as Record<string, Rule>;
export const ruleTypeToRules = new Map<RuleType, Rule[]>;

export function registerRule(rule: Rule): void {
  rules.push(rule);
  rules.sort((a, b) => (RuleTypeOrder.indexOf(a.type) - RuleTypeOrder.indexOf(b.type)) || (a.settingsKey.localeCompare(b.settingsKey)));
  rulesDict[rule.alias] = rule;

  if (ruleTypeToRules.has(rule.type)) {
    ruleTypeToRules.get(rule.type).push(rule);
  } else {
    ruleTypeToRules.set(rule.type, [rule]);
  }
}

export function wrapLintError(error: Error, ruleName: string) {
  let errorMessage: string;
  if (error instanceof YAMLException) {
    errorMessage = error.toString();
    errorMessage = getTextInLanguage('logs.wrapper-yaml-error').replace('{ERROR_MESSAGE}', errorMessage.substring(errorMessage.indexOf(':') + 1));
  } else {
    errorMessage = getTextInLanguage('logs.wrapper-unknown-error').replace('{ERROR_MESSAGE}', error.message);
  }

  throw new LinterError(`"${ruleName}" encountered an ${errorMessage}`, error);
}
