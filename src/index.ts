import type { ModuleDeclaration } from 'didi'
import AccordionPalette from './AccordionPalette'

// 使用 paletteProvider 同名参数 覆盖 默认 paletteProvider 构造函数
const accordionPalette: ModuleDeclaration = {
  __init__: ['palette'],
  palette: ['type', AccordionPalette]
}

export default accordionPalette
