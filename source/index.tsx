import React, { useState, useEffect, useMemo } from 'react';
import { Text, useInput } from 'ink';
import chalk from 'chalk';
import type { Except } from 'type-fest';

export type Props = {
	/**
	 * Text to display when `value` is empty.
	 */
	readonly placeholder?: string;

	/**
	 * Listen to user's input. Useful in case there are multiple input components
	 * at the same time and input must be "routed" to a specific component.
	 */
	readonly focus?: boolean; // eslint-disable-line react/boolean-prop-naming

	/**
	 * Replace all chars and mask the value. Useful for password inputs.
	 */
	readonly mask?: string;

	/**
	 * Whether to show cursor and allow navigation inside text input with arrow keys.
	 */
	readonly showCursor?: boolean; // eslint-disable-line react/boolean-prop-naming

	/**
	 * Highlight pasted text
	 */
	readonly highlightPastedText?: boolean; // eslint-disable-line react/boolean-prop-naming

	/**
	 * Value to display in a text input.
	 */
	readonly value: string;

	/**
	 * Function to call when value updates.
	 */
	readonly onChange: (value: string) => void;

	/**
	 * Function to call when `Enter` is pressed, where first argument is a value of the input.
	 */
	readonly onSubmit?: (value: string) => void;
};

function TextInput({
	value: originalValue,
	placeholder = '',
	focus = true,
	mask,
	highlightPastedText = false,
	showCursor = true,
	onChange,
	onSubmit,
}: Props) {
	const [state, setState] = useState({
		cursorOffset: (originalValue || '').length,
		cursorWidth: 0,
	});

	const { cursorOffset, cursorWidth } = state;

	useEffect(() => {
		setState(previousState => {
			if (!focus || !showCursor) {
				return previousState;
			}

			const newValue = originalValue || '';

			if (previousState.cursorOffset > newValue.length - 1) {
				return {
					cursorOffset: newValue.length,
					cursorWidth: 0,
				};
			}

			return previousState;
		});
	}, [originalValue, focus, showCursor]);

	const cursorActualWidth = highlightPastedText ? cursorWidth : 0;

	const value = mask ? mask.repeat(originalValue.length) : originalValue;
	let renderedValue = value;
	let renderedPlaceholder = placeholder ? chalk.grey(placeholder) : undefined;

	// Fake mouse cursor, because it's too inconvenient to deal with actual cursor and ansi escapes
	if (showCursor && focus) {
		renderedPlaceholder =
			placeholder.length > 0
				? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
				: chalk.inverse(' ');

		renderedValue = value.length > 0 ? '' : chalk.inverse(' ');

		let i = 0;

		for (const char of value) {
			renderedValue += i >= cursorOffset - cursorActualWidth && i <= cursorOffset ? chalk.inverse(char) : char;

			i++;
		}

		if (value.length > 0 && cursorOffset === value.length) {
			renderedValue += chalk.inverse(' ');
		}
	}

	const start = 0;
	const end = originalValue.length;

	const wordBoundaries = useMemo(() => {
		// "in-betweens" in the sense of not including the boundary between the first character and the start of the
		// string, nor the boundary between the final character and the end of the string.
		const inBetweens = [...originalValue.matchAll(/[\W_][^\W_]/g)].map(match => match.index + 1);

		// The only time this should result in duplicate entries is if `originalValue` is an empty string: the result
		// will be `[0, 0]` -- but in that scenario there are no other boundaries to navigate to anyway, so the
		// duplicate entries shouldn't have any practical consequence, so no point trying to handle it.
		return [start, ...inBetweens, end];
	}, [originalValue]);

	const [prevBoundary, nextBoundary] = useMemo(() => {
		let prev = wordBoundaries[0]!;
		let next = wordBoundaries[wordBoundaries.length - 1]!;

		for (const boundary of wordBoundaries) {
			if (boundary < cursorOffset) {
				prev = boundary;
			} else if (boundary > cursorOffset) {
				next = boundary;
				break;
			}
		}

		return [prev, next];
	}, [wordBoundaries, cursorOffset]);

	useInput(
		(input, key) => {
			if (key.upArrow || key.downArrow || (key.ctrl && input === 'c') || key.tab || (key.shift && key.tab)) {
				return;
			}

			if (key.return) {
				if (onSubmit) {
					onSubmit(originalValue);
				}

				return;
			}

			// Replace end-of-line sequences with regular spaces. This is primarily needed for newlines within pasted
			// text, since they won't be caught by the `key.return` check above.
			input = input.replace(/\r\n|\n/g, ' ');

			let nextCursorOffset = cursorOffset;
			let nextValue = originalValue;
			let nextCursorWidth = 0;

			if (key.ctrl && input === 'a') {
				if (showCursor) {
					nextCursorOffset = start;
				}
			} else if (key.ctrl && input === 'e') {
				if (showCursor) {
					nextCursorOffset = end;
				}
			} else if ((key.ctrl && key.leftArrow) || (key.meta && input === 'b')) {
				if (showCursor) {
					nextCursorOffset = prevBoundary;
				}
			} else if ((key.ctrl && key.rightArrow) || (key.meta && input === 'f')) {
				if (showCursor) {
					nextCursorOffset = nextBoundary;
				}
			} else if (key.leftArrow || (key.ctrl && input === 'b')) {
				if (showCursor && cursorOffset > start) {
					nextCursorOffset--;
				}
			} else if (key.rightArrow || (key.ctrl && input === 'f')) {
				if (showCursor && cursorOffset < end) {
					nextCursorOffset++;
				}
			} else if (key.ctrl && input === 'u') {
				if (cursorOffset > start) {
					nextValue = originalValue.slice(cursorOffset, end);
					nextCursorOffset = start;
				}
			} else if (key.ctrl && input === 'k') {
				if (cursorOffset < end) {
					nextValue = originalValue.slice(start, cursorOffset);
					// `nextCursorOffset` remains unchanged
				}
			} else if (key.ctrl && input === 'w') {
				if (cursorOffset > start) {
					nextValue = originalValue.slice(start, prevBoundary) + originalValue.slice(cursorOffset, end);
					nextCursorOffset = prevBoundary;
				}
			} else if (key.meta && input === 'd') {
				// NOTE: This is different to the `alt+d` behavior in both bash and zsh -- but in my defence, zsh is
				// weirdly inconsistent here, in that it deletes to the _end_ of the _current_ word (which is how bash
				// does forwards deletion and _navigation_), rather than  to the _start_ of the _next_ word (which is
				// how zsh does forwards navigation -- but apparently not deletion? why??).
				if (cursorOffset < end) {
					nextValue = originalValue.slice(start, cursorOffset) + originalValue.slice(nextBoundary, end);
					// `nextCursorOffset` remains unchanged
				}
			} else if (key.backspace || (key.ctrl && input === 'h')) {
				// Note: Checking for `ctrl+h` for completeness and clarity, but possibly unnecessary? Since some (if
				// not all?) terminal emulators intercept `ctrl+h` and send a backspace sequence directly.
				if (cursorOffset > start) {
					nextValue = originalValue.slice(start, cursorOffset - 1) + originalValue.slice(cursorOffset, end);
					nextCursorOffset--;
				}
			} else if (key.delete || (key.ctrl && input === 'd')) {
				if (cursorOffset < end) {
					nextValue = originalValue.slice(start, cursorOffset) + originalValue.slice(cursorOffset + 1, end);
					// `nextCursorOffset` remains unchanged
				}
			} else {
				nextValue = originalValue.slice(start, cursorOffset) + input + originalValue.slice(cursorOffset, end);

				nextCursorOffset += input.length;

				if (input.length > 1) {
					nextCursorWidth = input.length;
				}
			}

			if (cursorOffset < start) {
				nextCursorOffset = start;
			}

			if (cursorOffset > end) {
				nextCursorOffset = end;
			}

			setState({
				cursorOffset: nextCursorOffset,
				cursorWidth: nextCursorWidth,
			});

			if (nextValue !== originalValue) {
				onChange(nextValue);
			}
		},
		{ isActive: focus },
	);

	return <Text>{placeholder ? (value.length > 0 ? renderedValue : renderedPlaceholder) : renderedValue}</Text>;
}

export default TextInput;

type UncontrolledProps = {
	/**
	 * Initial value.
	 */
	readonly initialValue?: string;
} & Except<Props, 'value' | 'onChange'>;

export function UncontrolledTextInput({ initialValue = '', ...props }: UncontrolledProps) {
	const [value, setValue] = useState(initialValue);

	return <TextInput {...props} value={value} onChange={setValue} />;
}
