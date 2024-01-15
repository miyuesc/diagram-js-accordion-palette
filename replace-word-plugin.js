export default function replaceWord(options = {}) {
  const replaceWords = options.word || []
  return {
    name: "replace-word",
    generateBundle(_, bundle) {
      for (const fileName in bundle) {
        if (bundle.hasOwnProperty(fileName)) {
          const file = bundle[fileName];
          if (file.type === "chunk") {

            let replacedCode = file.code;

            for (const words of replaceWords) {
              replacedCode = replacedCode.replace(words[0], words[1])
            }

            file.code = replacedCode;
          }
        }
      }
    }
  };
}
