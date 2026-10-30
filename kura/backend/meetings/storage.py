from pathlib import Path
import boto3
from django.conf import settings


def client():
    return boto3.client(
        "s3", endpoint_url=settings.S3_ENDPOINT, region_name=settings.S3_REGION
    )


def local(key):
    p = (settings.MEDIA_ROOT / key).resolve()
    if not p.is_relative_to(settings.MEDIA_ROOT.resolve()):
        raise ValueError("Invalid object key")
    return p


def put(key, data):
    if settings.S3_BUCKET:
        client().put_object(Bucket=settings.S3_BUCKET, Key=key, Body=data)
    else:
        p = local(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)


def get(key):
    if settings.S3_BUCKET:
        return client().get_object(Bucket=settings.S3_BUCKET, Key=key)["Body"].read()
    return local(key).read_bytes()


def download(key, path):
    if settings.S3_BUCKET:
        client().download_file(settings.S3_BUCKET, key, str(path))
    else:
        Path(path).write_bytes(get(key))


def upload(key, path):
    if settings.S3_BUCKET:
        client().upload_file(str(path), settings.S3_BUCKET, key)
    else:
        put(key, Path(path).read_bytes())


def purge(prefix):
    if not settings.S3_BUCKET:
        import shutil

        shutil.rmtree(local(prefix), ignore_errors=True)
        return
    s3 = client()
    # Tarka buckets are versioned: remove actual versions and delete markers.
    for page in s3.get_paginator("list_object_versions").paginate(
        Bucket=settings.S3_BUCKET, Prefix=prefix
    ):
        objects = [
            {"Key": v["Key"], "VersionId": v["VersionId"]}
            for v in page.get("Versions", []) + page.get("DeleteMarkers", [])
        ]
        if objects:
            result = s3.delete_objects(
                Bucket=settings.S3_BUCKET, Delete={"Objects": objects, "Quiet": True}
            )
            if result.get("Errors"):
                raise RuntimeError("Object deletion is incomplete.")


def get_optional(key):
    from botocore.exceptions import ClientError

    try:
        return get(key)
    except FileNotFoundError:
        return None
    except ClientError as error:
        if error.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return None
        raise
