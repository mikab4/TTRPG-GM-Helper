class NotFoundError(Exception):
    pass


class ConflictError(Exception):
    pass


class UnsupportedMediaTypeError(Exception):
    pass


class AssetUploadTooLargeError(Exception):
    pass
