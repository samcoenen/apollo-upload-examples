import { createWriteStream, unlinkSync } from 'fs'
import { all } from 'promises-all'
import mkdirp from 'mkdirp'
import shortid from 'shortid'
import lowdb from 'lowdb'
import FileSync from 'lowdb/adapters/FileSync'
import { GraphQLUpload } from 'apollo-upload-server'

const uploadDir = './uploads'
const db = lowdb(new FileSync('db.json'))

// Seed an empty DB
db.defaults({ uploads: [] }).write()

// Ensure upload directory exists
mkdirp.sync(uploadDir)

const storeFS = ({ stream, filename }) => {
  const id = shortid.generate()
  const path = `${uploadDir}/${id}-${filename}`
  return new Promise((resolve, reject) =>
    stream
      .on('error', error => {
        if (stream.truncated)
          // Delete the truncated file
          unlinkSync(path)
        reject(error)
      })
      .on('end', () => resolve({ id, path }))
      .pipe(createWriteStream(path))
  )
}

const storeDB = file =>
  db
    .get('uploads')
    .push(file)
    .last()
    .write()

const processUpload = async upload => {
  const { stream, filename, mimetype, encoding } = await upload
  const { id, path } = await storeFS({ stream, filename })
  return storeDB({ id, filename, mimetype, encoding, path })
}

export default {
  Upload: GraphQLUpload,
  Query: {
    uploads: () => db.get('uploads').value()
  },
  Mutation: {
    singleUpload: (obj, { file }) => processUpload(file),
    multipleUpload: async (obj, { files }) => {
      const { resolve, reject } = await all(files.map(processUpload))
      if (reject.length)
        reject.forEach(({ name, message }) =>
          // eslint-disable-next-line no-console
          console.error(`${name}: ${message}`)
        )
      return resolve
    }
  }
}
