#!/usr/bin/env zx
$.verbose = false

const exportDir = argv._[0]

if (!exportDir) {
  throw Error("First argument must be path to export directory")
}

const exportHtmlPath = `${exportDir}/index.html`
const exportImagesDir = `${exportDir}/images`
await $`mkdir ${exportImagesDir}`

const data = await $`plutil -convert json -o - /System/Library/CoreServices/CoreTypes.bundle/Contents/Info.plist`

const items = JSON.parse(data).UTExportedTypeDeclarations
const itemsWithIcons = items.filter(item => item.UTTypeIcons?.UTTypeIconFile)

const iconsMap = Object.fromEntries(
  itemsWithIcons
    .map(item => (
      [
        item.UTTypeIcons.UTTypeIconFile,
        {
          icon: item.UTTypeIcons.UTTypeIconFile,
          deviceCodes: new Set()
        }
      ]
    ))
)

for (const item of itemsWithIcons) {
  for (const deviceCode of deviceCodesUsingIcon(item, item)) {
    iconsMap[item.UTTypeIcons.UTTypeIconFile].deviceCodes.add(deviceCode)
  }
}

function deviceCodesUsingIcon(rootItem, item) {
  const deviceCodes = new Set()
  if (rootItem === item || !item.UTTypeIcons) {
    let itemDeviceCodes = item.UTTypeTagSpecification?.['com.apple.device-model-code'] || []
    itemDeviceCodes = typeof itemDeviceCodes === "string" ? [itemDeviceCodes] : itemDeviceCodes
    for (const deviceCode of itemDeviceCodes) {
      deviceCodes.add(deviceCode)
    }
    for (const otherItem of items) {
      let conformsTo = otherItem.UTTypeConformsTo || []
      conformsTo = typeof conformsTo === "string" ? [conformsTo] : conformsTo
      if (otherItem !== rootItem && conformsTo.includes(item.UTTypeIdentifier)) {
        for (const deviceCode of deviceCodesUsingIcon(rootItem, otherItem)) {
          deviceCodes.add(deviceCode)
        }
      }
    }
  }
  return [...deviceCodes.values()]
} 

const icons = Object.values(iconsMap)
  .map(icon => ({ ...icon, deviceCodes: [...icon.deviceCodes.values()] }))
  .filter(icon => icon.deviceCodes.length)

let tableRowsHtml = ""

for (const icon of icons) {
  const tmpDir = await $`mktemp -d`
  const iconsetPath = `${tmpDir.toString().trim()}/icon.iconset`
  const iconPath = `/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/${icon.icon}`

  await $`iconutil -c iconset "${iconPath}" -o "${iconsetPath}"`

  const imagePath = `${iconsetPath.toString().trim()}/${await $`ls -al /tmp/blar.iconset/ | awk '{print $5 " " $9}' | sort -nr | awk '{print $2}' | head -1`}`.trim()
  const exportImageFilename = `${icon.icon}.png`
  const exportImagePath = `${exportImagesDir}/${exportImageFilename}`
  await $`mv "${imagePath}" "${exportImagePath}"`
  await $`rm -rf "${tmpDir}"`

  tableRowsHtml += `
    <tr>
      <th scope="row"><img src="./images/${exportImageFilename}" /></th>
      <td>${icon.deviceCodes.map(text => `<mark>${text}</mark>`).join(" ")}</td>
    </tr>
  `
}

const html = `
<html>
  <head>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css"
    />
    <style>
      tr {
        line-height: 2;
      }
    </style>
  </head>
  <body>
    <table>
      <thead>
        <tr>
          <th scope="col">Icon</th>
          <th scope="col">Device Codes</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>
  </body>
</html>
`

fs.writeFileSync(exportHtmlPath, html); 
