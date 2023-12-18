import { TokenNode } from '../nodes/tokenNode';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalCommand } from 'lexical';
import { COMMAND_PRIORITY_EDITOR, createCommand } from 'lexical';
import { useEffect } from 'react';

export const SERIALIZE_EDITOR_COMMAND: LexicalCommand<undefined> = createCommand();

export default function SerializeEditorPlugin({ serializeEditor }: { serializeEditor?: () => void }): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([TokenNode])) {
      throw new Error('DeleteTokenNodePlugin: TokenNode not registered on editor');
    }

    return editor.registerCommand<undefined>(
      SERIALIZE_EDITOR_COMMAND,
      () => {
        serializeEditor?.();
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor, serializeEditor]);

  return null;
}
