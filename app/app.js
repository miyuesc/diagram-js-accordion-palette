const PaletteModule = window['diagram-js-accordion-palette']

const translations = {
  tools: '工具',
  event: '事件节点',
}

const bpmnJS = new BpmnJS({
  container: '#canvas',
  additionalModules: [
    // ...
    PaletteModule,
    {
      translate: ['value', function customTranslate(template, replacements) {
        replacements = replacements || {};

        // Translate
        template = translations[template] || template;

        // Replace
        return template.replace(/{([^}]+)}/g, function(_, key) {
          return replacements[key] || '{' + key + '}';
        });
      }]
    }
  ],
  accordionPalette: {
    accordion: false,
    showName: true
  }
});

console.log(PaletteModule)

bpmnJS.createDiagram();

let nameVisible = true
let isAccordion = true
const palette = bpmnJS.get('palette')
function toggleName() {
  palette.toggleState({ showName: !nameVisible })
  nameVisible = !nameVisible
}
function toggleAccordion() {
  palette.toggleState({ accordion: !isAccordion })
  isAccordion = !isAccordion
}
function toggleVisible() {
  palette.toggle()
}

document.querySelector('#toggleName').addEventListener('click', toggleName)
document.querySelector('#toggleAccordion').addEventListener('click', toggleAccordion)
document.querySelector('#toggleVisible').addEventListener('click', toggleVisible)
