export const HEADER_LENGTH = 4;

export const readHeader = async (handle, position) => {
  const header = Buffer.alloc(HEADER_LENGTH);
  const { bytesRead } = await handle.read(header, 0, HEADER_LENGTH, position);

  return bytesRead < HEADER_LENGTH ? null : header.readUInt32BE(0);
};
